/**
 * ElectrumX Server Testing Utility
 * Test connectivity and functionality of public ElectrumX servers
 */

import * as net from 'node:net';
import * as tls from 'node:tls';

import { ElectrumXEndpoint } from '../config/electrumx-config.ts';
import { Buffer } from 'node:buffer';

export interface ServerTestResult {
  endpoint: ElectrumXEndpoint;
  connected: boolean;
  responseTime: number;
  serverVersion?: string;
  error?: string;
}

/**
 * Test individual ElectrumX server connectivity
 */
export function testElectrumXServer(
  endpoint: ElectrumXEndpoint,
): Promise<ServerTestResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      const result: ServerTestResult = {
        endpoint,
        connected: false,
        responseTime: Date.now() - startTime,
        error: 'Connection timeout',
      };
      resolve(result);
    }, endpoint.timeout || 10000);

    const onConnect = () => {
      clearTimeout(timeout);

      // Send server.version request to verify it's actually an ElectrumX server
      const request = JSON.stringify({
        id: 1,
        method: 'server.version',
        params: ['tx-builder-test', '1.4'],
      }) + '\n';

      socket.write(request);
    };

    const onData = (data: Buffer) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.result && Array.isArray(response.result)) {
          const result: ServerTestResult = {
            endpoint,
            connected: true,
            responseTime: Date.now() - startTime,
            serverVersion: response.result[0] || 'unknown',
          };
          socket.end();
          resolve(result);
        } else if (response.error) {
          const result: ServerTestResult = {
            endpoint,
            connected: false,
            responseTime: Date.now() - startTime,
            error: `Server error: ${response.error.message}`,
          };
          socket.end();
          resolve(result);
        }
      } catch (parseError) {
        const result: ServerTestResult = {
          endpoint,
          connected: false,
          responseTime: Date.now() - startTime,
          error: `Invalid response: ${
            parseError instanceof Error ? parseError.message : String(parseError)
          }`,
        };
        socket.end();
        resolve(result);
      }
    };

    const onError = (err: Error) => {
      clearTimeout(timeout);
      const result: ServerTestResult = {
        endpoint,
        connected: false,
        responseTime: Date.now() - startTime,
        error: err.message,
      };
      resolve(result);
    };

    let socket: net.Socket | tls.TLSSocket;

    if (endpoint.protocol === 'ssl') {
      socket = tls.connect(
        {
          host: endpoint.host,
          port: endpoint.port,
          rejectUnauthorized: false, // Many ElectrumX servers use self-signed certs
          timeout: endpoint.timeout || 10000,
        },
        onConnect,
      );
    } else if (endpoint.protocol === 'tcp') {
      socket = net.createConnection(
        {
          host: endpoint.host,
          port: endpoint.port,
          timeout: endpoint.timeout || 10000,
        },
        onConnect,
      );
    } else {
      clearTimeout(timeout);
      const result: ServerTestResult = {
        endpoint,
        connected: false,
        responseTime: 0,
        error: `Unsupported protocol: ${endpoint.protocol}`,
      };
      resolve(result);
      return;
    }

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('timeout', () => {
      socket.destroy();
      onError(new Error('Socket timeout'));
    });
  });
}

/**
 * Test all servers in an endpoint list
 */
export async function testAllServers(
  endpoints: ElectrumXEndpoint[],
): Promise<ServerTestResult[]> {
  console.log(`Testing ${endpoints.length} ElectrumX servers...\n`);

  const results = await Promise.all(
    endpoints.map((endpoint) => testElectrumXServer(endpoint)),
  );

  // Sort by response time for successful connections
  const working = results.filter((r) => r.connected).sort((a, b) =>
    a.responseTime - b.responseTime
  );
  const failed = results.filter((r) => !r.connected);

  console.log('='.repeat(80));
  console.log('WORKING SERVERS:');
  console.log('='.repeat(80));

  working.forEach((result) => {
    console.log(
      `✅ ${result.endpoint.host}:${result.endpoint.port} (${result.endpoint.protocol})`,
    );
    console.log(`   ${result.endpoint.description}`);
    console.log(`   Response time: ${result.responseTime}ms`);
    if (result.serverVersion) {
      console.log(`   Server version: ${result.serverVersion}`);
    }
    console.log();
  });

  if (failed.length > 0) {
    console.log('='.repeat(80));
    console.log('FAILED SERVERS:');
    console.log('='.repeat(80));

    failed.forEach((result) => {
      console.log(
        `❌ ${result.endpoint.host}:${result.endpoint.port} (${result.endpoint.protocol})`,
      );
      console.log(`   ${result.endpoint.description}`);
      console.log(`   Error: ${result.error}`);
      console.log();
    });
  }

  console.log('='.repeat(80));
  console.log(
    `SUMMARY: ${working.length}/${results.length} servers responding`,
  );
  console.log('='.repeat(80));

  if (working.length > 0) {
    console.log('\n💡 Fastest servers:');
    working.slice(0, 3).forEach((result, index) => {
      console.log(
        `   ${
          index + 1
        }. ${result.endpoint.host}:${result.endpoint.port} (${result.responseTime}ms)`,
      );
    });
  }

  return results;
}

/**
 * Get recommended server configuration based on test results
 */
export function getRecommendedConfig(
  results: ServerTestResult[],
): ElectrumXEndpoint[] {
  const working = results.filter((r) => r.connected).sort((a, b) =>
    a.responseTime - b.responseTime
  );

  // Prefer SSL over TCP, then by response time
  const sslServers = working.filter((r) => r.endpoint.protocol === 'ssl');
  const tcpServers = working.filter((r) => r.endpoint.protocol === 'tcp');

  const recommended = [...sslServers, ...tcpServers].slice(0, 5);

  // Update priorities based on performance
  return recommended.map((result, index) => ({
    ...result.endpoint,
    priority: index + 1,
  }));
}

/**
 * Simple connection test for a single endpoint (lighter than full test)
 */
export function pingElectrumXServer(
  endpoint: ElectrumXEndpoint,
): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(false);
    }, 5000);

    const onConnect = () => {
      clearTimeout(timeout);
      socket.end();
      resolve(true);
    };

    const onError = () => {
      clearTimeout(timeout);
      resolve(false);
    };

    let socket: net.Socket | tls.TLSSocket;

    if (endpoint.protocol === 'ssl') {
      socket = tls.connect(
        {
          host: endpoint.host,
          port: endpoint.port,
          rejectUnauthorized: false,
          timeout: 5000,
        },
        onConnect,
      );
    } else if (endpoint.protocol === 'tcp') {
      socket = net.createConnection(
        {
          host: endpoint.host,
          port: endpoint.port,
          timeout: 5000,
        },
        onConnect,
      );
    } else {
      clearTimeout(timeout);
      resolve(false);
      return;
    }

    socket.on('error', onError);
    socket.on('timeout', onError);
  });
}
