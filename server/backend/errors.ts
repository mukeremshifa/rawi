export class ApiError extends Error {
  constructor(public status: 400 | 401 | 404 | 409 | 503, public code: string, message: string) { super(message); }
}
export const notFound = () => new ApiError(404, 'not_found', 'This record is unavailable.');
export const conflict = () => new ApiError(409, 'revision_conflict', 'This record changed elsewhere. Review the latest version before saving again.');
