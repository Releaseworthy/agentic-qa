import { test } from '@playwright/test';

type Method<This, Args extends unknown[], R> = (this: This, ...args: Args) => Promise<R>;
type Context<This, Args extends unknown[], R> = ClassMethodDecoratorContext<This, Method<This, Args, R>>;

/**
 * Reports a page-object or seed method as one named, boxed `test.step`, so the
 * HTML report and traces read as business actions and a failure points at the
 * spec line that called it. A title function gets the method's leading
 * arguments. Outside a test (CLI scripts, global setup) the method just runs.
 *
 *   @step('Place the order')
 *   @step((id: string) => `Open order ${id}`)
 */
export function step(
  title: string,
): <This, Args extends unknown[], R>(
  target: Method<This, Args, R>,
  context: Context<This, Args, R>,
) => Method<This, Args, R>;
export function step<Head extends unknown[]>(
  title: (...args: Head) => string,
): <This, Args extends [...Head, ...unknown[]], R>(
  target: Method<This, Args, R>,
  context: Context<This, Args, R>,
) => Method<This, Args, R>;
export function step(title: string | ((...args: never[]) => string)): (target: never, context: never) => unknown {
  const name = (args: unknown[]) =>
    typeof title === 'string' ? title : (title as (...args: unknown[]) => string)(...args);
  return <This, R>(target: Method<This, unknown[], R>): Method<This, unknown[], R> =>
    function (this: This, ...args: unknown[]): Promise<R> {
      return inStep(name(args), () => target.call(this, ...args));
    };
}

/** Runs `body` as a boxed `test.step` inside a test, or plainly outside one. */
export function inStep<T>(title: string, body: () => Promise<T>): Promise<T> {
  return inTest() ? test.step(title, body, { box: true }) : body();
}

function inTest(): boolean {
  try {
    test.info();
    return true;
  } catch {
    return false;
  }
}
