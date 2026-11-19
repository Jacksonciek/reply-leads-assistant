import { createApp } from './app';
import type { Env } from './env';
import { makeServices } from './services';

const app = createApp(makeServices);

export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(req, env, ctx);
  },
} satisfies ExportedHandler<Env>;
