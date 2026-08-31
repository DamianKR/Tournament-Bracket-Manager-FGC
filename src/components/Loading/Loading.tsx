import './Loading.css';

interface LoadingProps {
  message?: string;
}

function Loading({ message = 'Loading...' }: LoadingProps) {
  return (
    <div className="loading-state">
      <i className="fas fa-circle-notch fa-spin loading-icon" />
      <span className="loading-text">{message}</span>
    </div>
  );
}

export default Loading;
