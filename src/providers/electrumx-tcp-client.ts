/**
 * TCP/SSL Client for ElectrumX connections
 * Provides direct TCP socket support for ElectrumX servers
 */

import * as net from 'node:net';
import * as tls from 'node:tls';
import { EventEmitter } from 'node:events';
import { Buffer } from 'node:buffer';
import type { ElectrumXEndpoint } from '../config/electrumx-config.ts';
import { clearTimeoutCompat, setTimeoutCompat, type TimerId } from '../utils/timer-utils.ts';

export interface TCPClientOptions {
  timeout?: number;
  keepAlive?: boolean;
  rejectUnauthorized?: boolean;
}

export class ElectrumXTCPClient extends EventEmitter {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private buffer = '';
  private requestId = 1;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    method: string;
    timer?: TimerId;
  }>();
  private connected = false;
  private endpoint: ElectrumXEndpoint | null = null;

  constructor(private options: TCPClientOptions = {}) {
    super();
  }

  /**
   * Connect to ElectrumX server via TCP or SSL
   */
  connect(endpoint: ElectrumXEndpoint): Promise<void> {
    if (this.connected) {
      throw new Error('Already connected');
    }

    this.endpoint = endpoint;

    return new Promise((resolve, reject) => {
      const timeout = setTimeoutCompat(() => {
        reject(
          new Error(`Connection timeout to ${endpoint.host}:${endpoint.port}`),
        );
        this.cleanup();
      }, this.options.timeout || endpoint.timeout || 10000);

      const onConnect = () => {
        clearTimeoutCompat(timeout);
        this.connected = true;
        this.emit('connected');
        resolve();
      };

      const onData = (data: Buffer) => {
        this.buffer += data.toString();
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              this.handleResponse(response);
            } catch (e) {
              console.error('Failed to parse response:', e);
              console.error('Raw line:', line);
            }
          }
        }
      };

      const onError = (err: Error) => {
        clearTimeoutCompat(timeout);

        // Enhanced error handling for ECONNRESET and other connection issues
        if (err.message.includes('ECONNRESET')) {
          console.warn(
            `ECONNRESET detected for ${endpoint.host}:${endpoint.port} - connection was reset by peer`,
          );
        } else if (err.message.includes('ECONNREFUSED')) {
          console.warn(
            `ECONNREFUSED detected for ${endpoint.host}:${endpoint.port} - connection refused`,
          );
        } else if (err.message.includes('EHOSTUNREACH')) {
          console.warn(
            `EHOSTUNREACH detected for ${endpoint.host}:${endpoint.port} - host unreachable`,
          );
        }

        this.emit('error', err);
        if (!this.connected) {
          reject(err);
        }
        this.cleanup();
      };

      const onClose = () => {
        this.emit('disconnected');
        this.cleanup();
      };

      // Create appropriate socket based on protocol
      if (endpoint.protocol === 'ssl') {
        this.socket = tls.connect({
          host: endpoint.host,
          port: endpoint.port,
          rejectUnauthorized: this.options.rejectUnauthorized !== undefined
            ? this.options.rejectUnauthorized
            : false, // Default to false for ElectrumX servers which often use self-signed certs
        });
      } else if (endpoint.protocol === 'tcp') {
        // Use plain TCP connection
        this.socket = net.createConnection({
          host: endpoint.host,
          port: endpoint.port,
        });
      } else {
        reject(new Error(`Unsupported protocol: ${endpoint.protocol}`));
        return;
      }

      // Set up event handlers
      this.socket.on('connect', onConnect);
      this.socket.on('data', onData);
      this.socket.on('error', onError);
      this.socket.on('close', onClose);

      // Keep alive
      if (this.options.keepAlive) {
        this.socket.setKeepAlive(true, 60000);
      }
    });
  }

  /**
   * Send request to ElectrumX server
   */
  request(method: string, params: any[] = []): Promise<any> {
    if (!this.connected || !this.socket) {
      throw new Error('Not connected');
    }

    const id = this.requestId++;

    return new Promise((resolve, reject) => {
      // Set up response handler
      const timer = setTimeoutCompat(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, 30000);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        method,
        timer,
      });

      // Send request
      const request = JSON.stringify({ id, method, params }) + '\n';
      this.socket!.write(request);
    });
  }

  /**
   * Handle response from server
   */
  private handleResponse(response: any): void {
    const handler = this.pendingRequests.get(response.id);

    if (handler) {
      clearTimeoutCompat(handler.timer);
      this.pendingRequests.delete(response.id);

      if (response.error) {
        handler.reject(new Error(response.error.message || 'Server error'));
      } else {
        handler.resolve(response.result);
      }
    }
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    this.cleanup();
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    this.connected = false;

    // Clear pending requests
    for (const [_id, handler] of this.pendingRequests) {
      clearTimeoutCompat(handler.timer);
      handler.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    // Close socket
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.buffer = '';
    this.endpoint = null;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get current endpoint
   */
  getEndpoint(): ElectrumXEndpoint | null {
    return this.endpoint;
  }
}
