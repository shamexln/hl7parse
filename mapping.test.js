// mapping.test.js

const express = require('express');
const request = require('supertest');
const fs = require('fs');
const path = require('path');

// 模拟logger以避免在测试中进行真实的日志记录
jest.mock('./logger', () => ({
    info: jest.fn(),
    error: jest.fn()
}));
const logger = require('./logger');

// 模拟fs.readdirSync
jest.mock('fs');

jest.mock('sqlite3', () => ({
    verbose: () => ({}),
}));

jest.mock('./path/to/codesystem', () => ({
    getCodesystemTableName: jest.fn().mockResolvedValue('mock_table_name')
}));
jest.mock('./path/to/your/paginationUtil', () => ({
    getPaginatedData: jest.fn((db, table, id, start, end, page, pageSize, cb) => {
        cb(null, {
            total: 1,
            rows: [{ code: 'demo', value: '示例' }]
        });
    })
}));

// 导入含有待测试API的模块
// 注意：根据你的实际项目结构可能需要调整
const { createHttpApp } = require('./http-server');
const {LISTCODESYSTEM_API} = require("./config");
const {getCodeSystemNames} = require("./codesystem");

describe('GET /api/codesystem-detail/paginated', () => {
    let app;
    let server;

    beforeAll(() => {
        jest.clearAllMocks();
        app = createHttpApp();
        server = app.listen(0); // 使用随机端口
    });

    afterAll((done) => {
        server.close(done);
    });

    it('should return paginated codesystem detail', async () => {
        const res = await request(server)
            .get('/api/codesystem-detail/paginated/') // 不传 id
            .query({ page: 1, pageSize: 5 });

        expect(res.status).toBe(200);
        expect(res.body.total).toBe(1);
        expect(Array.isArray(res.body.rows)).toBeTruthy();
        expect(res.body.rows[0]).toHaveProperty('code', 'demo');
        expect(res.body.rows[0]).toHaveProperty('value', '示例');
    });
});


describe('GET /api/codesystem-detail/paginated/:id', () => {
    let app;
    let server;
    beforeAll(() => {
        jest.clearAllMocks();
        app = createHttpApp();
        server = app.listen(0); // 使用随机端口
    });

    afterAll((done) => {
        server.close(done);
    });
    it('should return paginated codesystem detail with id', async () => {
        const id = '12345';
        const res = await request(app)
            .get(`/api/codesystem-detail/paginated/${id}`)
            .query({ page: 1, pageSize: 5 });

        expect(res.status).toBe(200);
        expect(res.body.total).toBe(1);
        expect(Array.isArray(res.body.rows)).toBe(true);
        expect(res.body.rows[0]).toHaveProperty('id', id);
        expect(res.body.rows[0]).toHaveProperty('code', 'mock-code');
        expect(res.body.rows[0]).toHaveProperty('value', '示例带ID');
    });
});


describe('API Endpoint: `${CODESYSTEM_API}`', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();

        // 设置测试的路由
        // 这里假设创建了一个简化版的app，只包含我们要测试的端点
        app.get(LISTCODESYSTEM_API, (req, res) => {
            try {
                const mappingNames = getCodeSystemNames();

                res.json({
                    success: true,
                    mappings: mappingNames
                });

                logger.info(`All custom tag mappings list retrieved via API`);
            } catch (error) {
                logger.error(`Error retrieving custom tag mappings list: ${error.message}`);
                res.status(500).json({
                    success: false,
                    message: "Failed to retrieve custom tag mappings list",
                    error: error.message
                });
            }
        });

    });

    afterEach(() => {

    });

    test('应返回映射名称列表 - 正常情况', async () => {
        // 模拟fs.readdirSync的返回值
        fs.readdirSync.mockReturnValue([
            'mapping1_map.xml',
            'mapping2_map.xml',
            'somefile.txt',
            'mapping3_map.xml'
        ]);

        const response = await request(app).get(LISTCODESYSTEM_API);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            success: true,
            mappings: ['mapping1', 'mapping2', 'mapping3']
        });
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('retrieved via API'));
    });

    test('应返回空映射列表 - 无映射文件', async () => {
        // 模拟fs.readdirSync的返回值 - 没有映射文件
        fs.readdirSync.mockReturnValue(['somefile.txt', 'anotherfile.js']);

        const response = await request(app).get(LISTCODESYSTEM_API);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            success: true,
            mappings: []
        });
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('retrieved via API'));
    });

    test('应返回500错误 - 文件系统错误', async () => {
        // 模拟fs.readdirSync抛出错误
        const errorMessage = 'Failed to read directory';
        fs.readdirSync.mockImplementation(() => {
            throw new Error(errorMessage);
        });

        const response = await request(app).get(LISTCODESYSTEM_API);

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
            success: false,
            message: 'Failed to retrieve custom tag mappings list',
            error: errorMessage
        });
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(errorMessage));
    });

    test('应正确过滤非映射文件', async () => {
        // 模拟fs.readdirSync的返回值 - 混合文件类型
        fs.readdirSync.mockReturnValue([
            'mapping1_map.xml',
            'notamapping_map.txt',
            'mapping2_map.xml',
            'mapping3_map.something.xml',
            'mapping4_map.xml',
            'prefix_mapping_map.xml'
        ]);

        const response = await request(app).get(LISTCODESYSTEM_API);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            success: true,
            mappings: ['mapping1', 'mapping2', 'mapping4', 'prefix_mapping']
        });
    });
});

// 如果需要集成测试，可以添加以下测试用例（这需要实际的应用实例）
describe('集成测试: `${CODESYSTEM_API}`', () => {
    let app;
    let server;

    beforeAll(() => {
        // 使用实际的应用，而不是模拟版本
        app = createHttpApp();
        server = app.listen(0); // 使用随机端口
    });

    afterAll((done) => {
        server.close(done);
    });

    test('应成功调用真实端点', async () => {
        // 模拟fs.readdirSync的返回值
        fs.readdirSync.mockReturnValue(['test1_map.xml', 'test2_map.xml']);

        const response = await request(server).get(LISTCODESYSTEM_API);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.mappings)).toBe(true);
    });
});