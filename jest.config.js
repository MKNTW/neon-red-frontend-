// jest.config.js - Конфигурация Jest
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    collectCoverageFrom: [
        'server.js',
        'js/**/*.js'
    ],
    coverageDirectory: 'coverage',
    verbose: true
};

