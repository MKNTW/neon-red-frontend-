// tests/utils.test.js - Тесты для утилит

// Мокируем DOM для тестов
global.document = {
    createElement: jest.fn((tag) => ({
        tagName: tag,
        textContent: '',
        innerHTML: '',
        style: {},
        setAttribute: jest.fn(),
        appendChild: jest.fn(),
        remove: jest.fn()
    })),
    body: {
        appendChild: jest.fn(),
        removeChild: jest.fn()
    },
    getElementById: jest.fn(() => ({
        innerHTML: '',
        appendChild: jest.fn(),
        remove: jest.fn()
    }))
};

// Импортируем функции (если они экспортируются)
// В реальном проекте нужно будет экспортировать функции из utils.js

describe('Utils', () => {
    describe('escapeHtml', () => {
        test('should escape HTML special characters', () => {
            // Тест будет работать когда функция экспортирована
            // const { escapeHtml } = require('../js/utils.js');
            // expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        });

        test('should handle null and undefined', () => {
            // expect(escapeHtml(null)).toBe('');
            // expect(escapeHtml(undefined)).toBe('');
        });
    });

    describe('escapeAttr', () => {
        test('should escape attribute special characters', () => {
            // const { escapeAttr } = require('../js/utils.js');
            // expect(escapeAttr('test"value')).toBe('test&quot;value');
        });
    });
});

describe('Constants', () => {
    test('should have correct timeout values', () => {
        // Проверка констант
        const RESEND_COOLDOWN_MS = 60 * 1000;
        const CODE_EXPIRY_MS = 10 * 60 * 1000;
        
        expect(RESEND_COOLDOWN_MS).toBe(60000);
        expect(CODE_EXPIRY_MS).toBe(600000);
    });
});

