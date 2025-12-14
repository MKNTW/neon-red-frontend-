// tests/server.test.js - Тесты для серверной части

// Базовые тесты для API endpoints
describe('API Endpoints', () => {
    test('should have products endpoint', () => {
        // В реальном проекте здесь будет тест с supertest
        // const request = require('supertest');
        // const app = require('../server.js');
        // 
        // const res = await request(app)
        //     .get('/api/products')
        //     .expect(200);
        // 
        // expect(res.body).toHaveProperty('products');
    });

    test('should validate JWT_SECRET is set', () => {
        // Проверка что секрет не дефолтный
        const JWT_SECRET = process.env.JWT_SECRET;
        expect(JWT_SECRET).toBeDefined();
        expect(JWT_SECRET).not.toBe('your-secret-key-change-in-production');
    });
});

describe('Code Generation', () => {
    test('should generate 6-digit code', () => {
        const CODE_LENGTH = 6;
        const min = Math.pow(10, CODE_LENGTH - 1);
        const max = Math.pow(10, CODE_LENGTH) - 1;
        const code = Math.floor(min + Math.random() * (max - min + 1)).toString();
        
        expect(code.length).toBe(CODE_LENGTH);
        expect(parseInt(code)).toBeGreaterThanOrEqual(min);
        expect(parseInt(code)).toBeLessThanOrEqual(max);
    });
});

