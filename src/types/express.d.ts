// Extends Express's Request type globally so `req.user` is recognized
// by TypeScript everywhere, once auth middleware has run.
export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}