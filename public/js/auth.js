import { getSupabaseConfigurationError, requireSupabase } from './supabase.js';

const authStatus = document.getElementById('auth-status');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

function setAuthStatus(message, state = '') {
    authStatus.textContent = message;
    authStatus.dataset.state = state;
}

document.querySelectorAll('[data-auth-view]').forEach(button => {
    button.addEventListener('click', () => {
        const showRegister = button.dataset.authView === 'register';
        loginForm.hidden = showRegister;
        registerForm.hidden = !showRegister;
        document.querySelectorAll('[data-auth-view]').forEach(tab => {
            tab.setAttribute('aria-pressed', String(tab === button));
        });
        setAuthStatus('');
    });
});

function getReturnUrl() {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    const gameId = params.get('game');
    if (joinCode && /^[A-Z0-9]{6}$/i.test(joinCode)) {
        return `index.html?join=${encodeURIComponent(joinCode.toUpperCase())}`;
    }
    if (gameId && /^[0-9a-f-]{36}$/i.test(gameId)) {
        return `index.html?game=${encodeURIComponent(gameId)}`;
    }
    return 'index.html';
}

async function submitAuthForm(event, action) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    setAuthStatus('');

    try {
        const supabase = requireSupabase();
        const data = Object.fromEntries(new FormData(form).entries());

        if (action === 'register') {
            const { data: result, error } = await supabase.auth.signUp({
                email: data.email,
                password: data.password,
                options: {
                    data: { display_name: data.name.trim() },
                    emailRedirectTo: new URL(getReturnUrl(), window.location.href).href,
                },
            });
            if (error) throw error;

            if (!result.session) {
                setAuthStatus('Conta criada. Confirme seu e-mail e depois entre para jogar.');
                form.reset();
                return;
            }
        } else {
            const { error } = await supabase.auth.signInWithPassword({
                email: data.email,
                password: data.password,
            });
            if (error) throw error;
        }

        window.location.assign(getReturnUrl());
    } catch (error) {
        setAuthStatus(error.message || getSupabaseConfigurationError(), 'error');
    } finally {
        submitButton.disabled = false;
    }
}

loginForm.addEventListener('submit', event => submitAuthForm(event, 'login'));
registerForm.addEventListener('submit', event => submitAuthForm(event, 'register'));

const configurationError = getSupabaseConfigurationError();
if (configurationError) {
    setAuthStatus(configurationError, 'error');
} else {
    requireSupabase().auth.getSession()
        .then(({ data, error }) => {
            if (error) throw error;
            if (data.session) window.location.assign(getReturnUrl());
        })
        .catch(error => setAuthStatus(error.message, 'error'));
}
