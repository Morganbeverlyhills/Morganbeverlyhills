export interface ISmsDriver {
  send(to: string, body: string): Promise<void>;
}