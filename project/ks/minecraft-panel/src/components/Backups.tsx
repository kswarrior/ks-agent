import { BackupInfo } from '../types';

interface BackupsProps {
  backups?: BackupInfo[];
}

export function Backups({ backups = [] }: BackupsProps) {
  return (
    <div className="card">
      <h2>Backups</h2>
      {backups.length === 0 ? (
        <p>No backups available</p>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Date</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((backup, i) => (
                <tr key={i}>
                  <td>{backup.name}</td>
                  <td>{backup.timestamp}</td>
                  <td>{backup.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}