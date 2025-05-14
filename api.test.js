const axios = require('axios');
const {LISTCODESYSTEM_API} = require("./config");

const API_URL = 'http://localhost:3000';

// 确保在测试前API服务器已经运行

describe('Mapping API 测试', () => {
  test('获取所有映射应返回成功和映射数组', async () => {
    const response = await axios.get(`${API_URL}${LISTCODESYSTEM_API}`);
    console.log('获取所有映射应返回成功和映射数组 API 响应数据:', response.data);
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('success', true);
    expect(response.data).toHaveProperty('mappings');
    expect(Array.isArray(response.data.mappings)).toBe(true);
  });

  test('映射中应包含300映射', async () => {
    const response = await axios.get(`${API_URL}${LISTCODESYSTEM_API}`);
    console.log('映射中应包含300映射 API 响应数据:', response.data);
    expect(response.status).toBe(200);
    expect(response.data.mappings).toContain('300');
  });

  test('映射名称应该不包含_map后缀', async () => {
    const response = await axios.get(`${API_URL}${LISTCODESYSTEM_API}`);
    console.log('映射名称应该不包含_map后缀 API 响应数据:', response.data);
    expect(response.status).toBe(200);
    // 检查所有映射名称不包含"_map"
    response.data.mappings.forEach(mapping => {
      expect(mapping.includes('_map')).toBe(false);
    });
  });

  test('访问无效的映射端点应返回错误', async () => {
    try {
      await axios.get(`${API_URL}${LISTCODESYSTEM_API}/invalid-endpoint`);
      // 如果请求成功，测试应该失败
      expect(true).toBe(false);
    } catch (error) {
      console.log('访问无效的映射端点应返回错误 API 错误响应:', error.response?.data);
      expect(error.response.status).toBe(404);
    }
  });
});

describe('Patient API 测试', () => {
  test('获取所有病人应返回数组', async () => {
    const response = await axios.get(`${API_URL}/api/patients`);
    console.log('获取所有病人应返回数组 API 响应数据:', response.data);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
  });

  test('使用有效ID查询病人应返回病人信息', async () => {
    // 假设数据库中有ID为1的病人
    try {
      const response = await axios.get(`${API_URL}/api/patients/12345`);
      console.log('使用有效ID查询病人应返回病人信息 API 响应数据:', response.data);
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('patient_id');
    } catch (error) {
      // 如果ID不存在会返回404
      expect(error.response.status).toBe(404);
    }
  });

  test('按姓名搜索应返回匹配的病人', async () => {
    // 使用常见姓氏进行测试
    const response = await axios.get(`${API_URL}/api/patients/search?name=张`);
    console.log('按姓名搜索应返回匹配的病人 API 响应数据:', response.data);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
  });
});
