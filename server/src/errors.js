export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const badRequest = (msg, details) => new AppError(400, msg, details);
export const unauthorized = (msg = 'Authentication required') => new AppError(401, msg);
export const notFound = (what = 'Resource') => new AppError(404, `${what} not found`);
export const conflict = (msg) => new AppError(409, msg);
export const isUnique = (e) => /UNIQUE constraint failed/.test(e?.message || '');
