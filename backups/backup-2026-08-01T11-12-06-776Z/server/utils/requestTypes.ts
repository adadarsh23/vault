import express from "express";

export interface AuthenticatedUser {
  userId: string;
  username: string;
  sessionId?: string;
}

export type RequestWithContext = express.Request & { requestId?: string };

export type AuthenticatedRequest = RequestWithContext & { user: AuthenticatedUser };
