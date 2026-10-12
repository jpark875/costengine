import { ScenarioError, type Scenario, simulate } from "../engine";

export interface Request {
  id: number;
  scenario: Scenario;
  draws: number;
  seed: number;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, scenario, draws, seed } = event.data;
  try {
    const result = simulate(scenario, draws, seed);
    (self as unknown as Worker).postMessage({ id, result }, [result.npv.buffer]);
  } catch (error) {
    const problems = error instanceof ScenarioError ? error.problems : [String(error)];
    (self as unknown as Worker).postMessage({ id, problems });
  }
};
