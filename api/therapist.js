// Vercel Serverless Function for AI Therapist API
export default async function handler(req, res) {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // 处理OPTIONS请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    try {
        // 只允许POST请求
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method Not Allowed' });
        }
        
        // 获取请求体
        const { userMessage } = req.body;
        
        if (!userMessage) {
            return res.status(400).json({ error: 'Missing userMessage parameter' });
        }
        
        // 从环境变量获取API密钥
        const aiApiKey = process.env.DEEPSEEK_API_KEY;
        
        if (!aiApiKey) {
            return res.status(500).json({ error: 'AI API key not configured' });
        }
        
        // 向DeepSeek API发送请求
        const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${aiApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'glm-4.5-air',
                messages: [
                    {
                        role: 'system',
                        content: '你是一个极其温柔、共情能力极强的心理治愈师。用户会向你倾诉他们的心事或烦恼。请你用一段简短、温暖、像真人朋友一样的话（不超过 50 个字）来安慰他们。不要说废话，不要像机器人。'
                    },
                    {
                        role: 'user',
                        content: userMessage
                    }
                ]
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API响应错误:', errorText);
            return res.status(response.status).json({ error: `API请求失败: ${response.status} - ${errorText}` });
        }
        
        const data = await response.json();
        
        // 检查响应数据格式
        if (data.choices && data.choices.length > 0 && data.choices[0].message) {
            const aiReply = data.choices[0].message.content.trim();
            // 返回AI回复
            return res.status(200).json({ aiReply });
        } else {
            return res.status(500).json({ error: 'API响应格式错误，没有找到有效的回复内容' });
        }
        
    } catch (error) {
        console.error('AI治愈师调用失败:', error);
        return res.status(500).json({ error: '内部服务器错误' });
    }
}
