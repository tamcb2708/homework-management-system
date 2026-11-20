import { HttpException, HttpStatus } from '@nestjs/common';

/** Application error with a stable machine-readable code and a Vietnamese user-facing message. */
export class AppError extends HttpException {
  constructor(status: HttpStatus, public readonly code: string, message: string, public readonly details?: unknown) {
    super({ code, message, details }, status);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new AppError(HttpStatus.BAD_REQUEST, code, message, details);
export const unauthorized = (code = 'UNAUTHORIZED', message = 'Vui lòng đăng nhập.') => new AppError(HttpStatus.UNAUTHORIZED, code, message);
export const forbidden = (code = 'FORBIDDEN', message = 'Bạn không có quyền thực hiện thao tác này.') => new AppError(HttpStatus.FORBIDDEN, code, message);
/** Used for "not found" AND "out of scope" so existence is never leaked. */
export const notFound = (message = 'Không tìm thấy dữ liệu.') => new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', message);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(HttpStatus.CONFLICT, code, message, details);
export const gone = (code: string, message: string) => new AppError(HttpStatus.GONE, code, message);
export const unprocessable = (code: string, message: string, details?: unknown) => new AppError(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
