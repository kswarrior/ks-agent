import type { Player } from '../types';

interface PlayersProps {
  players?: Player[];
}

export function Players({ players = [] }: PlayersProps) {
  return (
    <div className="card">
      <h2>Online Players ({players.length})</h2>
      {players.length === 0 ? (
        <p>No players online</p>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Mode</th>
                <th>Ping</th>
                <th>Level</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.id}>
                  <td>{player.name}</td>
                  <td>{player.mode}</td>
                  <td>{player.ping}ms</td>
                  <td>{player.level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}