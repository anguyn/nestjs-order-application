#!/usr/bin/env node

// Load PnP
require('./.pnp.cjs').setup();

// Patch require to handle builtins
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {
  // Allow Node.js builtins
  const builtins = [
    'events', 'buffer', 'stream', 'util', 'path', 'fs', 
    'crypto', 'http', 'https', 'net', 'tls', 'os', 
    'querystring', 'string_decoder', 'url', 'zlib',
    'punycode', 'assert', 'child_process', 'cluster',
    'dgram', 'dns', 'domain', 'readline', 'repl',
    'timers', 'tty', 'v8', 'vm', 'worker_threads'
  ];
  
  if (builtins.includes(request)) {
    return request;
  }
  
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// Run NestJS build
const { execSync } = require('child_process');

try {
  execSync('nest build', { 
    stdio: 'inherit',
    env: process.env
  });
  console.log('✅ Build completed successfully');
} catch (error) {
  console.error('❌ Build failed');
  process.exit(1);
}