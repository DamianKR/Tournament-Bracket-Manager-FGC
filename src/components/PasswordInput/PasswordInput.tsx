import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './PasswordInput.css';

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  id?: string;
  className?: string;
}

/**
 * Input de contraseña con botón de ojo para mostrar/ocultar el texto.
 * Reemplaza `type="password"` con `type={show ? 'text' : 'password'}`.
 * Acepta todas las props normales de <input> excepto `type`.
 */
function PasswordInput({ id, className = '', ...inputProps }: PasswordInputProps) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  return (
    <div className="password-input-wrap">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        className={`password-input-field ${className}`}
        {...inputProps}
      />
      <button
        type="button"
        className="password-toggle-btn"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? t('auth.hidePassword', 'Ocultar contraseña') : t('auth.showPassword', 'Mostrar contraseña')}
        title={show ? t('auth.hidePassword', 'Ocultar contraseña') : t('auth.showPassword', 'Mostrar contraseña')}
        tabIndex={-1}
      >
        <i className={show ? 'fas fa-eye-slash' : 'fas fa-eye'} aria-hidden="true" />
      </button>
    </div>
  );
}

export default PasswordInput;
