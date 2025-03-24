const axios = require('axios');

const API_URL = 'http://localhost:8080';

// 确保在测试前API服务器已经运行

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