import React, { useRef, useEffect, useState } from 'react';

const tileSize = 64;
const mapWidth = 10;
const mapHeight = 10;
const enemySpeed = 1000;
const projectileInterval = 100;

const createEnemy = (x, y, direction = 1) => ({
  x,
  y,
  direction,
  state: 'patrolling', // other: 'dead'
});

const initialLevelTemplate = () =>
  Array.from({ length: mapHeight }, () =>
    Array.from({ length: mapWidth }, () => ' ')
  );

export default function SpyTagGame() {
  const canvasRef = useRef(null);

  // Game state
  const [gameStarted, setGameStarted] = useState(false);
  const [role, setRole] = useState('');
  const [spyStyle, setSpyStyle] = useState('');
  const [gameplayStyle, setGameplayStyle] = useState('');

  const [playerPos, setPlayerPos] = useState({ x: 1, y: 1 });
  const [lastDir, setLastDir] = useState({ dx: 0, dy: -1 });
  const [enemies, setEnemies] = useState([]);
  const [projectiles, setProjectiles] = useState([]);
  const [levelTiles, setLevelTiles] = useState(initialLevelTemplate());
  const [junkMap, setJunkMap] = useState(new Map());
  const [inventory, setInventory] = useState([]);
  const [hasIntel, setHasIntel] = useState(false);

  const [coopBonus, setCoopBonus] = useState(0);
  const [disruptTime, setDisruptTime] = useState(0);
  const [score, setScore] = useState(0);

  // Start a new level
  const initLevel = (n) => {
    const size = 10 + (n - 1);
    const tiles = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => (Math.random() < 0.2 ? 'W' : ' '))
    );
    tiles[1][1] = 'P'; // player start
    tiles[1][Math.min(1 + n, size - 2)] = 'K'; // key
    tiles[Math.min(1 + Math.floor(n / 2), size - 2)][Math.min(size - 2, n)] = 'I'; // intel
    tiles[size - 2][size - 2] = 'E'; // exit
    setLevelTiles(tiles);

    // Scatter junk items
    const junkTypes = ['Spring', 'Battery', 'Circuit', 'Rope', 'Bottle', 'GasCan'];
    const newJunk = new Map();
    const count = Math.min(Math.max(n * 2, 5), 20);
    for (let i = 0; i < count; i++) {
      const x = 1 + Math.floor(Math.random() * (size - 2));
      const y = 1 + Math.floor(Math.random() * (size - 2));
      newJunk.set(`${x},${y}`, junkTypes[Math.floor(Math.random() * junkTypes.length)]);
    }
    setJunkMap(newJunk);

    setPlayerPos({ x: 1, y: 1 });
    setHasIntel(false);

    // Enemies
    const ec = Math.min(Math.floor(n / 5) + 1, 10);
    const newEnemies = [];
    for (let i = 0; i < ec; i++) {
      const ex = 1 + Math.floor(Math.random() * (size - 2));
      const ey = 1 + Math.floor(Math.random() * (size - 2));
      newEnemies.push(createEnemy(ex, ey, i % 2 === 0 ? 1 : -1));
    }
    setEnemies(newEnemies);

    setProjectiles([]);
    setCoopBonus(0);
    setDisruptTime(0);
    setScore(0);
  };

  // Handle keyboard in-game
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!gameStarted) return;

      // Van operator actions
      if (e.key === 'u' || e.key === 'U') {
        let closest = null,
          minD = Infinity;
        levelTiles.forEach((row, yy) =>
          row.forEach((t, xx) => {
            if (t === 'L') {
              const d = (xx - playerPos.x) ** 2 + (yy - playerPos.y) ** 2;
              if (d < minD) {
                minD = d;
                closest = [xx, yy];
              }
            }
          })
        );
        if (closest) {
          const [dx, dy] = closest;
          const newTiles = levelTiles.map((row, y) =>
            row.map((cell, x) => (x === dx && y === dy ? ' ' : cell))
          );
          setLevelTiles(newTiles);
          setCoopBonus((cb) => cb + 200);
        }
      }
      if (e.key === 'd' || e.key === 'D') {
        setDisruptTime(5);
        setCoopBonus((cb) => cb + 200);
      }

      // Movement
      let moved = false,
        dx = 0,
        dy = 0;
      if (e.key === 'ArrowUp') {
        dy = -1;
        dx = 0;
        moved = true;
      }
      if (e.key === 'ArrowDown') {
        dy = 1;
        dx = 0;
        moved = true;
      }
      if (e.key === 'ArrowLeft') {
        dx = -1;
        dy = 0;
        moved = true;
      }
      if (e.key === 'ArrowRight') {
        dx = 1;
        dy = 0;
        moved = true;
      }
      if (moved) {
        const nx = playerPos.x + dx,
          ny = playerPos.y + dy;
        const row = levelTiles[ny],
          tile = row && row[nx];
        if (row && tile !== 'W') {
          const newTiles = levelTiles.map((r, y) =>
            r.map((cell, x) => {
              if (y === ny && x === nx) {
                if (cell === 'K') return ' ';
                if (cell === 'L' && inventory.includes('Key')) return ' ';
                if (cell === 'I') return ' ';
                if (cell === 'E' && hasIntel) return 'E';
              }
              return cell;
            })
          );
          if (tile === 'K') setInventory((inv) => [...inv, 'Key']);
          if (tile === 'I') setHasIntel(true);
          setLevelTiles(newTiles);
          setPlayerPos({ x: nx, y: ny });
          setLastDir({ dx, dy });
        }
      }

      // Shoot
      if (e.key === ' ') {
        setProjectiles((ps) => [
          ...ps,
          { x: playerPos.x, y: playerPos.y, dx: lastDir.dx, dy: lastDir.dy },
        ]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameStarted, levelTiles, playerPos, lastDir, inventory, hasIntel, junkMap]);

  // Game loop
  useEffect(() => {
    if (!gameStarted) return;

    const interval = setInterval(() => {
      setEnemies((es) =>
        es.map((e) => {
          if (e.state === 'dead') return e;
          const ny = e.y + e.direction;
          if (levelTiles[ny] && levelTiles[ny][e.x] !== 'W') {
            return { ...e, y: ny };
          } else {
            return { ...e, direction: -e.direction };
          }
        })
      );
    }, enemySpeed);

    const frame = setInterval(() => {
      setDisruptTime((dt) => Math.max(0, dt - 0.1));

      setProjectiles((ps) => {
        return ps.flatMap((p) => {
          const nx = p.x + p.dx,
            ny = p.y + p.dy;
          if (
            nx < 0 ||
            ny < 0 ||
            ny >= levelTiles.length ||
            nx >= levelTiles[0].length
          )
            return [];
          if (levelTiles[ny][nx] === 'W') return [];
          let hitIndex = -1;
          enemies.forEach((e, i) => {
            if (e.state !== 'dead' && e.x === nx && e.y === ny) hitIndex = i;
          });
          if (hitIndex >= 0) {
            setEnemies((old) =>
              old.map((e, i) =>
                i === hitIndex ? { ...e, state: 'dead' } : e
              )
            );
            setScore((s) => s + 100);
            return [];
          }
          return [{ ...p, x: nx, y: ny }];
        });
      });

      // Render
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, tileSize * mapWidth, tileSize * mapHeight);
      levelTiles.forEach((row, y) =>
        row.forEach((t, x) => {
          ctx.fillStyle = t === 'W' ? '#000' : '#eee';
          ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
          ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
        })
      );
      enemies.forEach((e) => {
        if (e.state !== 'dead') {
          ctx.fillStyle = 'red';
          ctx.fillRect(e.x * tileSize + 16, e.y * tileSize + 16, 32, 32);
        }
      });
      projectiles.forEach((p) => {
        ctx.fillStyle = 'yellow';
        ctx.fillRect(p.x * tileSize + 24, p.y * tileSize + 24, 16, 16);
      });
      ctx.fillStyle = 'blue';
      ctx.fillRect(
        playerPos.x * tileSize + 8,
        playerPos.y * tileSize + 8,
        48,
        48
      );
    }, projectileInterval);

    return () => {
      clearInterval(interval);
      clearInterval(frame);
    };
  }, [
    gameStarted,
    levelTiles,
    enemies,
    projectiles,
    playerPos,
    lastDir,
    hasIntel,
    junkMap,
  ]);

  // Initial render is the role-selection screen
  if (!gameStarted) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white p-6">
        <h1 className="text-3xl mb-4">SpyTag Setup</h1>
        <div className="mb-4">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="text-black p-2"
          >
            <option value="">Select Role</option>
            <option value="spy">Spy</option>
            <option value="van">Van</option>
          </select>
        </div>
        {role === 'spy' && (
          <>
            <div className="mb-4">
              <select
                value={spyStyle}
                onChange={(e) => setSpyStyle(e.target.value)}
                className="text-black p-2"
              >
                <option value="">Spy Style</option>
                <option>White Hat</option>
                <option>Grey Hat</option>
                <option>Black Hat</option>
              </select>
            </div>
            <div className="mb-4">
              <select
                value={gameplayStyle}
                onChange={(e) => setGameplayStyle(e.target.value)}
                className="text-black p-2"
              >
                <option value="">Gameplay Style</option>
                <option>Collect Intel</option>
                <option>Distribute Items</option>
                <option>Stealth Delivery</option>
              </select>
            </div>
          </>
        )}
        <button
          disabled={!role || (role === 'spy' && (!spyStyle || !gameplayStyle))}
          onClick={() => { setGameStarted(true); initLevel(1); }}
        >
          Start Mission
        </button>
      </div>
    );
  }

  // Once started, show the game canvas
  return (
    <div className="flex flex-col items-center justify-center bg-gray-900 text-white p-4">
      <h2 className="text-2xl mb-2">
        Level Score {score}
      </h2>
      <canvas
        ref={canvasRef}
        width={tileSize * mapWidth}
        height={tileSize * mapHeight}
        className="border-4 border-white shadow-lg"
      />
      <div className="mt-2 text-sm">
        Coop bonus: {coopBonus} · Disrupt: {disruptTime.toFixed(1)}s
      </div>
      <button onClick={() => alert('Clicked!')}>Test Button</button>
    </div>
  );
}