// utils/logger.js
const chalk = require('chalk'); // Install with: yarn add chalk

const format = (level, message, meta) => {
  const time = new Date().toISOString();
  return `[${time}] ${level}: ${message} ${meta ? JSON.stringify(meta) : ''}`;
};

module.exports = {
  info: (msg, meta) => console.log(chalk.cyan(format('INFO', msg, meta))),
  warn: (msg, meta) => console.warn(chalk.yellow(format('WARN', msg, meta))),
  error: (msg, meta) => console.error(chalk.red(format('ERROR', msg, meta))),
  debug: (msg, meta) => console.debug(chalk.gray(format('DEBUG', msg, meta))),
};
