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
        const { userMessage, historyContext = [], userEmail } = req.body;
        
        if (!userMessage) {
            return res.status(400).json({ error: 'Missing userMessage parameter' });
        }
        
        if (!userEmail) {
            return res.status(400).json({ error: 'Missing userEmail parameter' });
        }
        
        // 从环境变量获取API密钥和Supabase配置
        const aiApiKey = process.env.ZHIPU_API_KEY;
        const supabaseUrl = process.env.SUPABASE_URL;
        
        if (!aiApiKey) {
            return res.status(500).json({ error: 'AI API key not configured' });
        }
        
        if (!supabaseUrl) {
            return res.status(500).json({ error: 'Supabase URL not configured' });
        }
        
        // 能量币管理逻辑
        // 1. 查询用户当前能量币余额
        const supabaseResponse = await fetch(
            `${supabaseUrl}/rest/v1/user_credits?email=eq.${encodeURIComponent(userEmail)}`,
            {
                method: 'GET',
                headers: {
                    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (!supabaseResponse.ok) {
            return res.status(500).json({ error: 'Failed to query user credits' });
        }
        
        const userCredits = await supabaseResponse.json();
        let credits;
        
        if (userCredits.length === 0) {
            // 2. 如果没有记录，插入一条初始记录（2个能量币）
            const insertResponse = await fetch(
                `${supabaseUrl}/rest/v1/user_credits`,
                {
                    method: 'POST',
                    headers: {
                        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({ email: userEmail, credits: 2 })
                }
            );
            
            if (!insertResponse.ok) {
                return res.status(500).json({ error: 'Failed to create user credits' });
            }
            
            const insertedData = await insertResponse.json();
            credits = insertedData[0].credits;
        } else {
            credits = userCredits[0].credits;
        }
        
        // 3. 检查余额是否充足
        if (credits <= 0) {
            return res.status(402).json({ error: 'insufficient_credits', message: '能量币已耗尽' });
        }
        
        // 4. 向智谱API发送请求
        // 构建messages数组，严格按照以下顺序：system提示词 -> 历史上下文 -> 当前用户消息
        const messages = [
            {
                role: 'system',
                content: '你是一个极其温柔的专属心理治愈师。请分析用户的留言情绪，并给出不超过 50 个字的治愈回复。你必须且只能返回合法的 JSON 字符串，不要包含任何 Markdown 代码块包裹，格式为：{"emotion": "情绪标签", "reply": "你的回复"}。情绪标签只能从这四个词中选一个：sad (悲伤/失落), angry (愤怒/焦虑), happy (开心/分享), tired (疲惫/压力)。'
            },
            // 插入历史上下文
            ...historyContext,
            // 添加当前用户的新消息
            {
                role: 'user',
                content: userMessage
            }
        ];
        
        console.log('发送给大模型的messages:', messages);
        
        const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${aiApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'glm-4.5-air',
                messages: messages
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
            
            // 5. AI回复成功后，扣除1个能量币
            await fetch(
                `${supabaseUrl}/rest/v1/user_credits?email=eq.${encodeURIComponent(userEmail)}`,
                {
                    method: 'PATCH',
                    headers: {
                        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ credits: credits - 1 })
                }
            );
            
            // 返回AI回复和更新后的能量币余额
            return res.status(200).json({ aiReply, remainingCredits: credits - 1 });
        } else {
            return res.status(500).json({ error: 'API响应格式错误，没有找到有效的回复内容' });
        }
        
    } catch (error) {
        console.error('AI治愈师调用失败:', error);
        return res.status(500).json({ error: '内部服务器错误' });
    }
}
