// Vercel Serverless Function for Afdian Webhook
// 用于处理爱发电的支付通知并自动充值能量币
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
        const { data } = req.body;
        
        if (!data || !data.order) {
            return res.status(400).json({ error: 'Invalid request format' });
        }
        
        // 1. 从请求体中提取用户邮箱和支付金额
        const { remark, total_amount } = data.order;
        
        if (!remark) {
            return res.status(400).json({ error: 'Missing remark (user email)' });
        }
        
        if (!total_amount) {
            return res.status(400).json({ error: 'Missing total_amount' });
        }
        
        // 提取用户邮箱
        const userEmail = remark.trim();
        
        // 2. 根据支付金额计算能量币
        let creditsToAdd;
        if (total_amount === 5) {
            creditsToAdd = 100;
        } else if (total_amount === 10) {
            creditsToAdd = 250;
        } else {
            // 其他金额不处理或按比例计算
            return res.status(400).json({ error: 'Unsupported amount' });
        }
        
        // 3. 使用Supabase REST API更新用户能量币余额
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
            return res.status(500).json({ error: 'Supabase configuration not found' });
        }
        
        // 查询用户当前能量币余额
        const queryResponse = await fetch(
            `${supabaseUrl}/rest/v1/user_credits?email=eq.${encodeURIComponent(userEmail)}`,
            {
                method: 'GET',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (!queryResponse.ok) {
            throw new Error('Failed to query user credits');
        }
        
        const userCredits = await queryResponse.json();
        let currentCredits = 0;
        
        if (userCredits.length > 0) {
            currentCredits = userCredits[0].credits;
        }
        
        // 更新用户能量币余额
        let updateResponse;
        if (userCredits.length > 0) {
            // 如果用户已有记录，更新
            updateResponse = await fetch(
                `${supabaseUrl}/rest/v1/user_credits?email=eq.${encodeURIComponent(userEmail)}`,
                {
                    method: 'PATCH',
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ credits: currentCredits + creditsToAdd })
                }
            );
        } else {
            // 如果用户没有记录，创建新记录
            updateResponse = await fetch(
                `${supabaseUrl}/rest/v1/user_credits`,
                {
                    method: 'POST',
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({ email: userEmail, credits: creditsToAdd })
                }
            );
        }
        
        if (!updateResponse.ok) {
            throw new Error('Failed to update user credits');
        }
        
        // 4. 向爱发电返回指定格式的响应
        return res.status(200).json({ ec: 200, em: '' });
        
    } catch (error) {
        console.error('Afdian Webhook error:', error);
        // 即使发生错误，也要向爱发电返回成功响应，避免重复通知
        return res.status(200).json({ ec: 200, em: '' });
    }
}