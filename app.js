class MindRhythmsApp {
    constructor() {
        this.heartRate = 0;
        this.baseline = null;
        this.heartRateReadings = [];
        this.device = null;
        this.characteristic = null;
        this.isConnected = false;
        this.elevatedStartTime = null;
        this.breathingTimer = null;
        this.breathingStartTime = null;
        this.breathingActive = false;
        this.breathingPhase = 'inhale';
        this.deferredPrompt = null;
        this.wakeLock = null;
        this.demoMode = false;
        this.userProfile = null;
        this.expectedBaseline = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadTheme();
        this.registerServiceWorker();
        this.setupPWA();
        this.setupDebugMode();
        this.requestNotificationPermission();
        this.checkOnboarding();
    }

    setupEventListeners() {
        document.getElementById('connect-sensor').addEventListener('click', () => this.connectHeartRateSensor());
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('start-breathing').addEventListener('click', () => this.startBreathingExercise());
        document.getElementById('stop-breathing').addEventListener('click', () => this.stopBreathingExercise());
        document.getElementById('start-alert-breathing').addEventListener('click', () => this.startBreathingFromAlert());
        document.getElementById('dismiss-alert').addEventListener('click', () => this.dismissAlert());
        document.getElementById('install-app').addEventListener('click', () => this.installApp());
        document.getElementById('dismiss-install').addEventListener('click', () => this.dismissInstallPrompt());
        document.getElementById('onboarding-form').addEventListener('submit', (e) => this.handleOnboarding(e));
    }

    async connectHeartRateSensor() {
        if (!navigator.bluetooth) {
            alert('Web Bluetooth is not supported in this browser. Entering demo mode.');
            this.enterDemoMode();
            return;
        }

        try {
            const connectButton = document.getElementById('connect-sensor');
            connectButton.textContent = 'Connecting...';
            connectButton.disabled = true;

            this.device = await navigator.bluetooth.requestDevice({
                filters: [{ services: ['heart_rate'] }],
                optionalServices: ['battery_service']
            });

            this.device.addEventListener('gattserverdisconnected', () => this.onDisconnected());

            const server = await this.device.gatt.connect();
            const service = await server.getPrimaryService('heart_rate');
            this.characteristic = await service.getCharacteristic('heart_rate_measurement');

            await this.characteristic.startNotifications();
            this.characteristic.addEventListener('characteristicvaluechanged', (event) => this.handleHeartRateData(event));

            this.isConnected = true;
            this.updateConnectionStatus();
            this.showBreathingSection();
            
            connectButton.textContent = 'Connected';
            connectButton.disabled = true;
        } catch (error) {
            console.error('Connection failed:', error);
            alert('Failed to connect to heart rate sensor. Please try again.');
            document.getElementById('connect-sensor').textContent = 'Connect Heart Rate Sensor';
            document.getElementById('connect-sensor').disabled = false;
        }
    }

handleHeartRateData(event) {
    const value = event.target.value;
    const flags = value.getUint8(0);

    let heartRate = 0;
    if ((flags & 0x01) === 0) {
        heartRate = value.getUint8(1);
    } else {
        heartRate = value.getUint16(1, true);
    }

    console.log(`Raw Data Length: ${value.byteLength}`);
    console.log(`Flags: ${flags.toString(2).padStart(8, '0')}`);
    console.log(`Heart Rate: ${heartRate} bpm`);
    console.log(`Heart Rate Buffer:`, this.heartRateReadings);
    console.log(`Baseline:`, this.baseline);
    if (this.baseline) console.log(`Delta:`, heartRate - this.baseline);

    this.heartRate = heartRate;
    this.heartRateReadings.push(heartRate);

    this.updateHeartRateDisplay();
    this.calculateBaseline();
    this.checkForAnxiety();
    this.updateDebugPanel();

    this.saveData();
}

    updateHeartRateDisplay() {
        document.getElementById('heart-rate-value').textContent = this.heartRate;
    }

    calculateBaseline() {
        if (this.heartRateReadings.length === 30) {
            this.baseline = Math.round(
                this.heartRateReadings.slice(0, 30).reduce((sum, hr) => sum + hr, 0) / 30
            );
            document.getElementById('baseline-text').textContent = `Baseline: ${this.baseline} bpm`;
        } else if (this.heartRateReadings.length < 30) {
            document.getElementById('baseline-text').textContent = `Baseline: Calculating... (${this.heartRateReadings.length}/30)`;
        }
        this.updateDebugPanel();
    }

    checkForAnxiety() {
        if (!this.baseline || this.heartRate === 0) return;

        const isElevated = this.heartRate >= (this.baseline + 15);
        
        if (isElevated) {
            if (!this.elevatedStartTime) {
                this.elevatedStartTime = Date.now();
            } else if (Date.now() - this.elevatedStartTime > 60000) {
                this.showAnxietyAlert();
                this.elevatedStartTime = null;
            }
        } else {
            this.elevatedStartTime = null;
        }
    }

    showAnxietyAlert() {
        document.getElementById('anxiety-alert').classList.remove('hidden');
        
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
        }
        
        this.showNotification();
    }

    dismissAlert() {
        document.getElementById('anxiety-alert').classList.add('hidden');
    }

    startBreathingFromAlert() {
        this.dismissAlert();
        this.startBreathingExercise();
    }

    async startBreathingExercise() {
        if (this.breathingActive) return;

        this.breathingActive = true;
        this.breathingStartTime = Date.now();
        this.breathingPhase = 'inhale';
        
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
            } catch (err) {
                console.log('WakeLock error:', err);
            }
        }
        
        document.getElementById('start-breathing').classList.add('hidden');
        document.getElementById('stop-breathing').classList.remove('hidden');
        document.getElementById('breathing-timer').classList.remove('hidden');
        
        this.breathingCycle();
        this.updateBreathingTimer();
    }

    breathingCycle() {
        if (!this.breathingActive) return;

        const circle = document.getElementById('breathing-circle');
        const text = document.getElementById('breathing-text');

        if (this.breathingPhase === 'inhale') {
            circle.classList.remove('exhale');
            circle.classList.add('inhale');
            text.textContent = 'Inhale';
            this.breathingPhase = 'exhale';
            
            setTimeout(() => this.breathingCycle(), 4000);
        } else {
            circle.classList.remove('inhale');
            circle.classList.add('exhale');
            text.textContent = 'Exhale';
            this.breathingPhase = 'inhale';
            
            setTimeout(() => this.breathingCycle(), 6000);
        }
    }

    updateBreathingTimer() {
        if (!this.breathingActive) return;

        const elapsed = Math.floor((Date.now() - this.breathingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        
        document.getElementById('timer-minutes').textContent = minutes.toString().padStart(2, '0');
        document.getElementById('timer-seconds').textContent = seconds.toString().padStart(2, '0');
        
        setTimeout(() => this.updateBreathingTimer(), 1000);
    }

    stopBreathingExercise() {
        this.breathingActive = false;
        
        if (this.wakeLock) {
            this.wakeLock.release();
            this.wakeLock = null;
        }
        
        const circle = document.getElementById('breathing-circle');
        circle.classList.remove('inhale', 'exhale');
        document.getElementById('breathing-text').textContent = 'Breathe';
        
        document.getElementById('start-breathing').classList.remove('hidden');
        document.getElementById('stop-breathing').classList.add('hidden');
        document.getElementById('breathing-timer').classList.add('hidden');
    }

    onDisconnected() {
        this.isConnected = false;
        this.device = null;
        this.characteristic = null;
        this.updateConnectionStatus();
        
        document.getElementById('connect-sensor').textContent = 'Connect Heart Rate Sensor';
        document.getElementById('connect-sensor').disabled = false;
        document.getElementById('heart-rate-value').textContent = '--';
        document.getElementById('breathing-section').classList.add('hidden');
    }

    updateConnectionStatus() {
        const indicator = document.getElementById('connection-indicator');
        const text = document.getElementById('connection-text');
        
        if (this.isConnected) {
            indicator.classList.remove('disconnected');
            indicator.classList.add('connected');
            text.textContent = 'Connected';
        } else {
            indicator.classList.remove('connected');
            indicator.classList.add('disconnected');
            text.textContent = 'Not Connected';
        }
    }

    showBreathingSection() {
        document.getElementById('breathing-section').classList.remove('hidden');
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        document.getElementById('theme-toggle').querySelector('.theme-icon').textContent = newTheme === 'light' ? '🌙' : '☀️';
        
        localStorage.setItem('theme', newTheme);
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        document.getElementById('theme-toggle').querySelector('.theme-icon').textContent = savedTheme === 'light' ? '🌙' : '☀️';
    }

    saveData() {
        const data = {
            heartRateReadings: this.heartRateReadings.slice(-100),
            baseline: this.baseline,
            lastUpdated: Date.now()
        };
        localStorage.setItem('mindrhythms-data', JSON.stringify(data));
    }

    loadData() {
        const savedData = localStorage.getItem('mindrhythms-data');
        if (savedData) {
            const data = JSON.parse(savedData);
            this.heartRateReadings = data.heartRateReadings || [];
            this.baseline = data.baseline;
            
            if (this.baseline) {
                document.getElementById('baseline-text').textContent = `Baseline: ${this.baseline} bpm`;
            }
            this.updateDebugPanel();
        }
        
        const userProfile = localStorage.getItem('userProfile');
        if (userProfile) {
            this.userProfile = JSON.parse(userProfile);
            this.expectedBaseline = this.getExpectedBaseline(this.userProfile.gender, this.userProfile.ageGroup);
            this.showExpectedBaseline();
        }
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('./service-worker.js');
                console.log('ServiceWorker registered successfully:', registration);
            } catch (error) {
                console.log('ServiceWorker registration failed:', error);
            }
        }
    }

    setupPWA() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            document.getElementById('install-prompt').classList.remove('hidden');
        });

        window.addEventListener('appinstalled', () => {
            console.log('PWA was installed');
            this.dismissInstallPrompt();
        });

        if (window.matchMedia('(display-mode: standalone)').matches) {
            document.getElementById('install-prompt').classList.add('hidden');
        }
    }

    async installApp() {
        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            this.deferredPrompt = null;
        }
        this.dismissInstallPrompt();
    }

    dismissInstallPrompt() {
        document.getElementById('install-prompt').classList.add('hidden');
    }

    checkForDemoMode() {
        if (!navigator.bluetooth) {
            console.log('Bluetooth not available — entering demo mode');
            this.enterDemoMode();
        }
    }

    checkOnboarding() {
        const userProfile = localStorage.getItem('userProfile');
        if (!userProfile) {
            this.showOnboarding();
        } else {
            this.userProfile = JSON.parse(userProfile);
            this.expectedBaseline = this.getExpectedBaseline(this.userProfile.gender, this.userProfile.ageGroup);
            this.showExpectedBaseline();
            this.checkForDemoMode();
        }
    }

    showOnboarding() {
        document.getElementById('onboarding-overlay').classList.remove('hidden');
    }

    handleOnboarding(event) {
        event.preventDefault();
        const formData = new FormData(event.target);
        
        this.userProfile = {
            gender: formData.get('gender'),
            ageGroup: formData.get('ageGroup')
        };
        
        localStorage.setItem('userProfile', JSON.stringify(this.userProfile));
        
        this.expectedBaseline = this.getExpectedBaseline(this.userProfile.gender, this.userProfile.ageGroup);
        this.baseline = this.expectedBaseline;
        
        document.getElementById('onboarding-overlay').classList.add('hidden');
        this.showExpectedBaseline();
        this.checkForDemoMode();
    }

    getExpectedBaseline(gender, ageGroup) {
        const baselines = {
            female: {
                '18-25': 76,
                '26-35': 74.5,
                '36-45': 76,
                '46-55': 75.5,
                '56-65': 75,
                '65+': 74.5
            },
            male: {
                '18-25': 71.5,
                '26-35': 73.5,
                '36-45': 73.5,
                '46-55': 74,
                '56-65': 74,
                '65+': 71.5
            }
        };
        
        return Math.round(baselines[gender][ageGroup]);
    }

    showExpectedBaseline() {
        const expectedElement = document.getElementById('expected-baseline');
        const expectedText = document.getElementById('expected-baseline-text');
        
        if (this.expectedBaseline) {
            expectedText.textContent = `Expected baseline: ${this.expectedBaseline} bpm`;
            expectedElement.classList.remove('hidden');
        }
    }

    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission !== 'granted') {
            Notification.requestPermission().then(permission => {
                console.log('Notification permission:', permission);
            });
        }
    }

    showNotification() {
        if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                const notification = new Notification('MindRhythms', {
                    body: 'Elevated heart rate detected. Tap to begin breathing exercise.',
                    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDE5MiAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxOTIiIGhlaWdodD0iMTkyIiByeD0iMjQiIGZpbGw9IiMyNTYzZWIiLz4KPHN2ZyB4PSI0OCIgeT0iNDgiIHdpZHRoPSI5NiIgaGVpZ2h0PSI5NiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiPgo8cGF0aCBkPSJNMjAuODQgNC42MWExNS43ODEgMTUuNzgxIDAgMCAwLTcuNTcyIDIuNzNjLTIuNzUyLjg4My01LjE3IDIuNzMtNy41NzIgMi43My0yLjQwMiAwLTQuODIgMS44NDctNy41NzItMi43M0ExNS43ODEgMTUuNzgxIDAgMCAwIDMuMTYgNC42MVYxM0ExMC41IDEwLjUgMCAwIDAgNy41IDIxaDlhMTAuNSAxMC41IDAgMCAwIDQuNS04VjQuNjF6Ii8+Cjwvc3ZnPgo8L3N2Zz4K',
                    badge: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDE5MiAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxOTIiIGhlaWdodD0iMTkyIiByeD0iMjQiIGZpbGw9IiMyNTYzZWIiLz4KPHN2ZyB4PSI0OCIgeT0iNDgiIHdpZHRoPSI5NiIgaGVpZ2h0PSI5NiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiPgo8cGF0aCBkPSJNMjAuODQgNC42MWExNS43ODEgMTUuNzgxIDAgMCAwLTcuNTcyIDIuNzNjLTIuNzUyLjg4My01LjE3IDIuNzMtNy41NzIgMi43My0yLjQwMiAwLTQuODIgMS44NDctNy41NzItMi43M0ExNS43ODEgMTUuNzgxIDAgMCAwIDMuMTYgNC42MVYxM0ExMC41IDEwLjUgMCAwIDAgNy41IDIxaDlhMTAuNSAxMC41IDAgMCAwIDQuNS04VjQuNjF6Ii8+Cjwvc3ZnPgo8L3N2Zz4K',
                    tag: 'heart-rate-alert',
                    requireInteraction: true
                });

                notification.onclick = () => {
                    window.focus();
                    notification.close();
                    this.dismissAlert();
                    this.startBreathingExercise();
                };

                setTimeout(() => {
                    notification.close();
                }, 5000);
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission();
            }
        }
    }

    enterDemoMode() {
        this.demoMode = true;
        document.getElementById('demo-mode-indicator').classList.remove('hidden');
        document.getElementById('connect-sensor').textContent = 'Demo Mode Active';
        document.getElementById('connect-sensor').disabled = true;
        this.showBreathingSection();
        
        setInterval(() => {
            this.heartRate = 60 + Math.floor(Math.random() * 40);
            this.heartRateReadings.push(this.heartRate);
            this.updateHeartRateDisplay();
            this.calculateBaseline();
            this.checkForAnxiety();
            this.updateDebugPanel();
            this.saveData();
        }, 3000);
    }

    setupDebugMode() {
        if (localStorage.getItem('debug') === 'true') {
            document.getElementById('debug-panel').classList.remove('hidden');
        }
    }

    updateDebugPanel() {
        if (localStorage.getItem('debug') === 'true') {
            document.getElementById('debug-hr').textContent = `${this.heartRate} bpm`;
            document.getElementById('debug-baseline').textContent = this.baseline ? `${this.baseline} bpm` : '--';
            document.getElementById('debug-delta').textContent = 
                this.baseline ? `${this.heartRate - this.baseline} bpm` : '--';
            document.getElementById('debug-buffer').textContent = 
                this.heartRateReadings.slice(-10).join(', ');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new MindRhythmsApp();
    app.loadData();
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'CACHE_UPDATED') {
            console.log('App has been updated. Refresh to see the latest version.');
        }
    });
}

window.enableDebugMode = function() {
    localStorage.setItem('debug', 'true');
    location.reload();
};

window.disableDebugMode = function() {
    localStorage.removeItem('debug');
    location.reload();
};
