/**
 * regenerateTournamentMatches.js — Recrea los registros de partidos de torneo a partir del bracket.
 *
 * Algunos torneos completados no guardaron sus partidos en tournament_matches porque
 * la petición al servidor se hacía sin token. Este script lee los brackets existentes,
 * genera los registros faltantes y los escribe en el backend configurado (JSON o Supabase).
 *
 * El createdAt se estima a partir de tournament.updatedAt, restando minutos según la
 * ronda y número de partido, para que queden ordenados de manera coherente (ronda 1
 * primero, final la más reciente).
 *
 * Uso:
 *   node --env-file=.env.local scripts/regenerateTournamentMatches.js
 *
 * Si ya corríste una versión anterior con createdAt incorrectos y quieres regenerar todo:
 *   node --env-file=.env.local scripts/regenerateTournamentMatches.js --reset
 */

import { tournaments, tournamentMatches } from '../server/db/collections.js';

const reset = process.argv.includes('--reset');

function deterministicId(tournamentId, round, matchNumber, bracketType) {
  return `tm_${tournamentId}_r${round}_m${matchNumber}_${bracketType}`;
}

function matchKey(tournamentId, round, matchNumber) {
  return `${tournamentId}:${round}:${matchNumber}`;
}

async function main() {
  const allTournaments = await tournaments.getAll();
  const existingMatches = await tournamentMatches.getAll();

  if (reset) {
    console.log('⚠️  Modo reset: eliminando todos los tournament_matches existentes...');
    for (const m of existingMatches) {
      await tournamentMatches.remove(m.id);
    }
  }

  const existingMap = new Map(existingMatches.map(m => [matchKey(m.tournamentId, m.round, m.matchNumber), m]));

  const toAdd = [];

  for (const t of allTournaments) {
    if (t.type === 'teams' || !t.bracket) continue;

    const participantMap = new Map(t.participants.map(p => [p.id, p]));
    const updatedAt = new Date(t.updatedAt || t.createdAt).getTime();

    // Recolectar rondas para saber el máximo
    const allMatches = [
      ...(t.bracket?.winnerBracket ?? []),
      ...(t.bracket?.loserBracket ?? []),
      t.bracket?.grandFinal,
      t.bracket?.grandFinalReset,
    ].filter(Boolean);
    const maxRound = Math.max(...allMatches.map(m => m.roundNumber || 0), 0);

    function buildRecord(match) {
      if (!match || !match.participant1Id || !match.participant2Id || !match.winnerId) return null;
      if (match.status !== 'completed') return null;

      const p1 = participantMap.get(match.participant1Id);
      const p2 = participantMap.get(match.participant2Id);
      if (!p1 || !p2) return null;

      const bracketOffset = {
        'winner': 0,
        'loser': 5000,
        'grandFinal': 10000,
        'grandFinalReset': 10001,
      }[match.bracketType] ?? 0;

      const isFinal = match.bracketType === 'grandFinal' || match.bracketType === 'grandFinalReset';
      const roundOffset = (maxRound - (match.roundNumber || 0)) * 60000;
      const matchOffset = (match.matchNumber || 0) * 1000;
      const createdAt = isFinal
        ? new Date(updatedAt - 1000).toISOString() // la final es lo último
        : new Date(updatedAt - roundOffset - matchOffset - bracketOffset).toISOString();

      return {
        id: deterministicId(t.id, match.roundNumber, match.matchNumber, match.bracketType),
        tournamentId: t.id,
        tournamentName: t.name,
        player1Id: match.participant1Id,
        player2Id: match.participant2Id,
        player1GlobalId: p1.globalParticipantId ?? null,
        player2GlobalId: p2.globalParticipantId ?? null,
        player1Name: p1.name ?? 'Unknown',
        player2Name: p2.name ?? 'Unknown',
        winnerId: match.winnerId,
        winnerGlobalId: match.winnerId === match.participant1Id
          ? (p1.globalParticipantId ?? null)
          : (p2.globalParticipantId ?? null),
        round: match.roundNumber,
        matchNumber: match.matchNumber,
        createdAt,
      };
    }

    for (const match of allMatches) {
      const record = buildRecord(match);
      if (!record) continue;

      const existing = existingMap.get(matchKey(record.tournamentId, record.round, record.matchNumber));

      if (existing && existing.id === record.id) {
        // Ya existe con nuestro ID determinista: actualizar createdAt
        toAdd.push(record);
      } else if (!existing) {
        // No existe: crear
        toAdd.push(record);
      }
      // Si existe con otro ID (creado por la app) lo dejamos intacto
    }
  }

  for (const match of toAdd) {
    await tournamentMatches.upsert(match);
  }

  console.log(`✅ Regenerated ${toAdd.length} tournament match records.`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
