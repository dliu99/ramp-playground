"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./snake.module.css";

const BOARD_SIZE = 20;
const STARTING_SNAKE = [
  { x: 10, y: 10 },
  { x: 9, y: 10 },
  { x: 8, y: 10 },
];

type Point = { x: number; y: number };
type Direction = "up" | "down" | "left" | "right";
type GameState = "ready" | "playing" | "paused" | "lost" | "won";

const VECTORS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

function pointKey(point: Point): string {
  return `${point.x}:${point.y}`;
}

function nextFood(snake: Point[]): Point | null {
  const occupied = new Set(snake.map(pointKey));
  const available: Point[] = [];

  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (!occupied.has(`${x}:${y}`)) available.push({ x, y });
    }
  }

  return available.length
    ? available[Math.floor(Math.random() * available.length)] ?? null
    : null;
}

function speedFor(score: number): number {
  return Math.max(58, 135 - Math.floor(score / 4) * 7);
}

export default function SnakePage() {
  const [snake, setSnake] = useState<Point[]>(STARTING_SNAKE);
  const [food, setFood] = useState<Point>(() => nextFood(STARTING_SNAKE) ?? { x: 14, y: 10 });
  const [gameState, setGameState] = useState<GameState>("ready");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const directionRef = useRef<Direction>("right");
  const queuedDirectionRef = useRef<Direction>("right");

  useEffect(() => {
    const stored = Number.parseInt(window.localStorage.getItem("snake-best") ?? "0", 10);
    if (Number.isFinite(stored)) setBest(stored);
  }, []);

  const reset = useCallback(() => {
    const freshSnake = STARTING_SNAKE.map((point) => ({ ...point }));
    directionRef.current = "right";
    queuedDirectionRef.current = "right";
    setSnake(freshSnake);
    setFood(nextFood(freshSnake) ?? { x: 14, y: 10 });
    setScore(0);
    setGameState("playing");
  }, []);

  const chooseDirection = useCallback((next: Direction) => {
    if (gameState === "lost" || gameState === "won") {
      reset();
      return;
    }

    if (OPPOSITE[directionRef.current] !== next) {
      queuedDirectionRef.current = next;
    }
    if (gameState === "ready" || gameState === "paused") setGameState("playing");
  }, [gameState, reset]);

  const togglePause = useCallback(() => {
    setGameState((current) => {
      if (current === "playing") return "paused";
      if (current === "paused" || current === "ready") return "playing";
      return current;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const keys: Record<string, Direction | undefined> = {
        ArrowUp: "up",
        w: "up",
        W: "up",
        ArrowDown: "down",
        s: "down",
        S: "down",
        ArrowLeft: "left",
        a: "left",
        A: "left",
        ArrowRight: "right",
        d: "right",
        D: "right",
      };
      const next = keys[event.key];

      if (next) {
        event.preventDefault();
        chooseDirection(next);
      } else if (event.code === "Space") {
        event.preventDefault();
        if (gameState === "lost" || gameState === "won") reset();
        else togglePause();
      } else if (event.key === "Enter" && gameState !== "playing") {
        reset();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chooseDirection, gameState, reset, togglePause]);

  useEffect(() => {
    if (gameState !== "playing") return;

    const timer = window.setInterval(() => {
      setSnake((currentSnake) => {
        const activeDirection = queuedDirectionRef.current;
        directionRef.current = activeDirection;
        const vector = VECTORS[activeDirection];
        const head = currentSnake[0]!;
        const nextHead = { x: head.x + vector.x, y: head.y + vector.y };
        const ate = nextHead.x === food.x && nextHead.y === food.y;
        const bodyToCheck = ate ? currentSnake : currentSnake.slice(0, -1);
        const hitWall = nextHead.x < 0 || nextHead.y < 0 || nextHead.x >= BOARD_SIZE || nextHead.y >= BOARD_SIZE;
        const hitSelf = bodyToCheck.some((part) => part.x === nextHead.x && part.y === nextHead.y);

        if (hitWall || hitSelf) {
          setGameState("lost");
          return currentSnake;
        }

        const moved = ate
          ? [nextHead, ...currentSnake]
          : [nextHead, ...currentSnake.slice(0, -1)];

        if (ate) {
          const newScore = score + 1;
          setScore(newScore);
          setBest((currentBest) => {
            const newBest = Math.max(currentBest, newScore);
            window.localStorage.setItem("snake-best", String(newBest));
            return newBest;
          });
          const newFood = nextFood(moved);
          if (newFood) setFood(newFood);
          else setGameState("won");
        }

        return moved;
      });
    }, speedFor(score));

    return () => window.clearInterval(timer);
  }, [food, gameState, score]);

  const occupied = new Map(snake.map((part, index) => [pointKey(part), index]));
  const status = gameState === "ready"
    ? "press a direction to start"
    : gameState === "paused"
      ? "paused"
      : gameState === "lost"
        ? "game over"
        : gameState === "won"
          ? "board cleared"
          : "snacking";

  return (
    <main className={styles.page}>
      <section className={styles.game} aria-label="Snake game">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>tiny arcade / 01</p>
            <h1>SNAKE<span>.</span></h1>
          </div>
          <div className={styles.scores}>
            <p><span>score</span><strong>{String(score).padStart(3, "0")}</strong></p>
            <p><span>best</span><strong>{String(best).padStart(3, "0")}</strong></p>
          </div>
        </header>

        <div className={styles.boardWrap}>
          <div className={styles.board} role="grid" aria-label={`${BOARD_SIZE} by ${BOARD_SIZE} game board`}>
            {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
              const point = { x: index % BOARD_SIZE, y: Math.floor(index / BOARD_SIZE) };
              const snakeIndex = occupied.get(pointKey(point));
              const isFood = food.x === point.x && food.y === point.y;
              const className = snakeIndex === 0
                ? styles.head
                : snakeIndex !== undefined
                  ? styles.body
                  : isFood
                    ? styles.food
                    : styles.cell;

              return <span className={className} key={index} role="gridcell" />;
            })}
          </div>

          {gameState !== "playing" && (
            <div className={styles.overlay}>
              <p>{status}</p>
              <button type="button" onClick={gameState === "paused" ? togglePause : reset}>
                {gameState === "paused" ? "resume" : gameState === "ready" ? "start game" : "play again"}
              </button>
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          <p><i className={styles.live} />{status}</p>
          <button type="button" onClick={togglePause} disabled={gameState === "lost" || gameState === "won"}>
            {gameState === "paused" ? "resume" : "pause"} <kbd>space</kbd>
          </button>
        </footer>
      </section>

      <aside className={styles.controls} aria-label="Game controls">
        <p>move</p>
        <div className={styles.dpad}>
          <button type="button" aria-label="Move up" onClick={() => chooseDirection("up")}>↑</button>
          <button type="button" aria-label="Move left" onClick={() => chooseDirection("left")}>←</button>
          <button type="button" aria-label="Move down" onClick={() => chooseDirection("down")}>↓</button>
          <button type="button" aria-label="Move right" onClick={() => chooseDirection("right")}>→</button>
        </div>
        <p className={styles.hint}>arrow keys<br />or wasd</p>
        <div className={styles.legend}>
          <span><i className={styles.snakeSwatch} /> you</span>
          <span><i className={styles.foodSwatch} /> snack</span>
        </div>
      </aside>
    </main>
  );
}
