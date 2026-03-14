// DOM 元素
let messageInput, sendBtn, messagesContainer;
// 认证相关 DOM 元素
let mainContent, authCard, authForm, emailInput, passwordInput, authSubmit;
let userStatus, userName, logoutBtn;
let supabaseClient;
// 当前认证状态
let currentUser = null;

// 检查 Supabase SDK 是否可用
function checkSupabaseReady() {
    return new Promise((resolve, reject) => {
        if (typeof supabase !== 'undefined') {
            resolve();
            return;
        }
        
        let attempts = 0;
        const maxAttempts = 50; // 最多等 5 秒
        
        const interval = setInterval(() => {
            attempts++;
            if (typeof supabase !== 'undefined') {
                clearInterval(interval);
                resolve();
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                reject(new Error('Supabase SDK 加载失败，请检查网络连接'));
            }
        }, 100);
    });
}

// 页面加载时获取所有留言
document.addEventListener('DOMContentLoaded', async () => {
    // 初始化 DOM 元素
    messageInput = document.getElementById('message-input');
    sendBtn = document.getElementById('send-btn');
    messagesContainer = document.getElementById('messages-container');
    
    // 初始化认证相关 DOM 元素
    mainContent = document.querySelector('.main-content');
    authCard = document.getElementById('auth-card');
    authForm = document.getElementById('auth-form');
    emailInput = document.getElementById('email');
    passwordInput = document.getElementById('password');
    authSubmit = document.getElementById('auth-submit');
    
    userStatus = document.getElementById('user-status');
    userName = document.getElementById('user-name');
    logoutBtn = document.getElementById('logout-btn');
    
    try {
        await checkSupabaseReady();
        
        // 初始化 Supabase 客户端
        const supabaseUrl = 'https://oyknfljdmuxyiktksdlu.supabase.co';
        const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95a25mbGpkbXV4eWlrdGtzZGx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzODIxNDAsImV4cCI6MjA4ODk1ODE0MH0.QjmR4UjA-YgEhAwtGHHLXarsNssy8xh_KbcVlKeD5tk';
        supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
        
        // 设置认证状态监听
        setupAuthStateListener();
        
        // 设置认证相关事件处理
        setupAuthEvents();
        
        // 初始检查认证状态
        const { data: { session } } = await supabaseClient.auth.getSession();
        updateUIForAuthState(session?.user);
        
        // 获取留言
        if (session?.user) {
            await fetchMessages();
            
            // 设置实时订阅
            const channel = supabaseClient.channel('custom-all-channel')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                    // 当有新消息插入时
                    console.log('新消息:', payload);
                    // 直接使用 payload.new 中的数据创建新卡片
                    addNewMessage(payload.new);
                })
                // 监听连接状态
                .on('status', (status) => {
                    console.log('实时连接状态:', status);
                    if (status === 'closed') {
                        console.log('实时连接已关闭，尝试重新连接...');
                    }
                })
                .subscribe();
        }
        
        // 添加新消息到列表
        function addNewMessage(message) {
            const messageCard = document.createElement('div');
            messageCard.className = 'message-card new-message';
            
            // 作者信息
            if (message.author) {
                const authorElement = document.createElement('div');
                authorElement.className = 'message-author';
                authorElement.textContent = message.author;
                messageCard.appendChild(authorElement);
            }
            
            const contentElement = document.createElement('div');
            contentElement.className = 'message-content';
            contentElement.textContent = message.content;
            
            const timeElement = document.createElement('div');
            timeElement.className = 'message-time';
            timeElement.textContent = formatRelativeTime(message.created_at);
            
            messageCard.appendChild(contentElement);
            messageCard.appendChild(timeElement);
            
            // 将新卡片插入到最顶端
            messagesContainer.prepend(messageCard);
            
            // 3秒后移除动画类
            setTimeout(() => {
                messageCard.classList.remove('new-message');
            }, 500);
        }
        
        // 添加事件监听器
        sendBtn.addEventListener('click', async () => {
            await sendMessage();
        });
        
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.shiftKey) {
                // 允许 Shift+Enter 换行
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });
    } catch (error) {
        console.error(error);
        showToast(error.message);
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.textContent = 'SDK加载失败';
        }
        if (messagesContainer) {
            messagesContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">SDK加载失败，请刷新页面重试</div>';
        }
    }
});

// 设置认证状态监听
function setupAuthStateListener() {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('认证状态变化:', event, session);
        updateUIForAuthState(session?.user);
    });
}

// 设置认证相关事件处理
function setupAuthEvents() {
    // 表单提交 - 自动登录/注册
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleAuthSubmit();
    });
    
    // 退出登录
    logoutBtn.addEventListener('click', async () => {
        await signOut();
    });
}

// 处理认证提交 - 自动登录/注册
async function handleAuthSubmit() {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    
    if (!email || !password) {
        showToast('请输入邮箱和密码');
        return;
    }
    
    try {
        authSubmit.disabled = true;
        authSubmit.textContent = '处理中...';
        
        // 尝试登录
        const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });
        
        if (loginError) {
            // 登录失败，尝试注册
            console.log('登录失败，尝试注册:', loginError);
            
            const { data: registerData, error: registerError } = await supabaseClient.auth.signUp({
                email,
                password
            });
            
            if (registerError) {
                throw registerError;
            }
            
            // 注册成功后自动登录
            await signIn(email, password);
        }
        
        showToast('登录成功');
    } catch (error) {
        showToast(error.message);
    } finally {
        authSubmit.disabled = false;
        authSubmit.textContent = '登录/注册';
    }
}

// 登录
async function signIn(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });
    
    if (error) {
        throw error;
    }
}

// 退出登录
async function signOut() {
    const { error } = await supabaseClient.auth.signOut();
    
    if (error) {
        showToast('退出登录失败：' + error.message);
        return;
    }
    
    showToast('退出登录成功');
}

// 更新UI以反映认证状态
function updateUIForAuthState(user) {
    currentUser = user;
    
    if (user) {
        // 用户已登录
        unlockApp();
        
        // 显示用户状态
        userStatus.style.display = 'flex';
        
        // 提取邮箱前缀作为用户名
        const email = user.email;
        const username = email.split('@')[0];
        userName.innerHTML = `👤 ${username}`;
        
        // 启用输入框和发送按钮
        messageInput.disabled = false;
        sendBtn.disabled = false;
        
        // 获取留言列表
        fetchMessages();
    } else {
        // 用户未登录
        lockApp();
        
        // 隐藏用户状态
        userStatus.style.display = 'none';
        
        // 禁用输入框和发送按钮
        messageInput.disabled = true;
        sendBtn.disabled = true;
    }
}

// 锁定应用 - 显示登录卡片和模糊效果
function lockApp() {
    mainContent.classList.add('blurred');
    authCard.classList.remove('hidden');
}

// 解锁应用 - 隐藏登录卡片和模糊效果
function unlockApp() {
    // 添加解锁动画效果
    authCard.classList.add('hidden');
    mainContent.classList.remove('blurred');
}

// 获取留言列表
async function fetchMessages() {
    try {
        const { data, error } = await supabaseClient
            .from('messages')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        renderMessages(data);
    } catch (error) {
        showToast('获取留言失败：' + error.message);
    }
}

// 发送留言
async function sendMessage() {
    const content = messageInput.value.trim();
    
    if (!content) {
        showToast('请输入留言内容');
        return;
    }

    try {
        sendBtn.disabled = true;
        sendBtn.textContent = '发送中...';

        // 提取用户名（邮箱前缀）
        const email = currentUser.email;
        const username = email.split('@')[0];
        
        const { data, error } = await supabaseClient
            .from('messages')
            .insert([{ content, author: username }])
            .select();

        if (error) {
            throw error;
        }

        // 清空输入框
        messageInput.value = '';
        
        // 刷新留言列表
        await fetchMessages();
        
        showToast('发送成功');
        
        // 触发AI自动回复
        console.log('准备触发AI回复，用户留言:', content);
        console.log('是否符合触发条件:', !content.startsWith('✨ [AI 治愈师]：'));
        if (!content.startsWith('✨ [AI 治愈师]：')) {
            await callAITherapist(content);
        } else {
            console.log('跳过AI回复，因为是AI自己的留言');
        }
    } catch (error) {
        showToast('发送失败：' + error.message);
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = '发送';
    }
}

// 渲染留言列表
function renderMessages(messages) {
    messagesContainer.innerHTML = '';
    
    messages.forEach(message => {
        const messageCard = document.createElement('div');
        messageCard.className = 'message-card';
        
        // 作者信息
        if (message.author) {
            const authorElement = document.createElement('div');
            authorElement.className = 'message-author';
            authorElement.textContent = message.author;
            messageCard.appendChild(authorElement);
        }
        
        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        contentElement.textContent = message.content;
        
        const timeElement = document.createElement('div');
        timeElement.className = 'message-time';
        timeElement.textContent = formatRelativeTime(message.created_at);
        
        messageCard.appendChild(contentElement);
        messageCard.appendChild(timeElement);
        messagesContainer.appendChild(messageCard);
    });
}

// 格式化相对时间
function formatRelativeTime(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) {
        return '刚刚';
    }
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
        return `${diffInMinutes}分钟前`;
    }
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
        return `${diffInHours}小时前`;
    }
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) {
        return `${diffInDays}天前`;
    }
    
    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) {
        return `${diffInMonths}个月前`;
    }
    
    const diffInYears = Math.floor(diffInMonths / 12);
    return `${diffInYears}年前`;
}

// 调用AI治愈师
async function callAITherapist(userMessage) {
    try {
        console.log('开始调用AI治愈师，用户留言:', userMessage);
        
        // 调用我们自己的后端API
        const response = await fetch('/api/therapist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userMessage })
        });
        
        console.log('API响应状态:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API响应错误:', errorText);
            throw new Error(`API请求失败: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log('API响应数据:', data);
        
        if (data.aiReply) {
            const aiReply = data.aiReply;
            console.log('AI原始回复:', aiReply);
            
            // 在回复前加上前缀
            const aiMessage = `✨ [AI 治愈师]：${aiReply}`;
            console.log('带前缀的AI回复:', aiMessage);
            
            // 将AI回复插入数据库，作者设为 "AI 治愈师"
            console.log('准备将AI回复插入数据库');
            const { data: insertData, error: insertError } = await supabaseClient
                .from('messages')
                .insert([{ content: aiMessage, author: 'AI 治愈师' }])
                .select();
            
            if (insertError) {
                console.error('数据库插入失败:', insertError);
                throw insertError;
            }
            
            console.log('AI治愈师回复成功，数据库插入结果:', insertData);
        } else {
            throw new Error('API响应格式错误，没有找到有效的回复内容');
        }
        
    } catch (error) {
        console.error('AI治愈师调用失败:', error);
        // 这里不显示错误提示，避免影响用户体验
    }
}

// 手动测试 AI 回复（可以在浏览器控制台中调用）
window.testAIReply = async function() {
    const testMessage = '今天心情不太好';
    console.log('手动测试 AI 回复，测试留言:', testMessage);
    await callAITherapist(testMessage);
};

// 显示 Toast 提示
function showToast(message) {
    // 创建 Toast 元素
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.classList.add('show');
    
    // 3秒后隐藏
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}