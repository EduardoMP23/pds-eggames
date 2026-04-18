'use strict';

/**
 * PM2 ecosystem config — Hostinger VPS (2 vCPU, 8 GB RAM)
 *
 * Run with:
 *   pm2 start ecosystem.config.js
 *   pm2 save          # persist across reboots
 *   pm2 startup       # generate systemd unit
 */
module.exports = {
  apps: [
    {
      name:    'board-games',
      script:  'server.js',

      // Single instance: in-memory room state cannot be shared across workers
      // without a shared store (e.g. Redis). Scale vertically first.
      instances:  1,
      exec_mode:  'fork',

      watch: false,

      // Restart if the process exceeds 1 GB — guards against slow memory leaks.
      max_memory_restart: '1G',

      env: {
        NODE_ENV: 'production',
        PORT:     3000,
        // DB_PATH defaults to ./data/rooms.db — override here if needed.
        // DB_PATH: '/var/data/board-games/rooms.db',
      },

      // Log files — make sure the logs/ directory exists or PM2 will create it.
      error_file:      'logs/err.log',
      out_file:        'logs/out.log',
      merge_logs:      true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Graceful shutdown: give the process 5 s to flush DB before SIGKILL.
      kill_timeout:  5000,
      listen_timeout: 8000,
    },
  ],
};
