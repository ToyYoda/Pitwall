import type { TelemetrySample, LapSummary } from '../models/index.js';

export type MessageType =
  | 'DRIVER_CONNECT'
  | 'DRIVER_DISCONNECT'
  | 'TELEMETRY_SAMPLE'
  | 'LAP_COMPLETE'
  | 'SESSION_INFO_UPDATE'
  | 'STRATEGY_PUSH'
  | 'CHAT_MESSAGE'
  | 'PING'
  | 'PONG';

export interface BaseMessage {
  type: MessageType;
  sessionId: string;
  senderId: string;
  sentAt: number; // ms since epoch (client clock)
}

export interface DriverConnectMessage extends BaseMessage {
  type: 'DRIVER_CONNECT';
  teamToken: string;
  displayName: string;
}

export interface TelemetryMessage extends BaseMessage {
  type: 'TELEMETRY_SAMPLE';
  sample: TelemetrySample;
}

export interface LapCompleteMessage extends BaseMessage {
  type: 'LAP_COMPLETE';
  summary: LapSummary;
}

export interface PingMessage extends BaseMessage {
  type: 'PING';
}

export interface PongMessage extends BaseMessage {
  type: 'PONG';
  serverReceivedAt: number;
}

export type ClientToServerMessage =
  | DriverConnectMessage
  | TelemetryMessage
  | LapCompleteMessage
  | PingMessage;

export type ServerToClientMessage = PongMessage;

export type PitwallMessage = ClientToServerMessage | ServerToClientMessage;
