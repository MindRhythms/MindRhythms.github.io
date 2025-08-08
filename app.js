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
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadTheme();
        this.registerServiceWorker();
        this.setupPWA();
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
    }

    async connectHeartRateSensor() {
        if (!navigator.bluetooth) {
            alert('Web Bluetooth is not supported in this browser.');
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

    this.heartRate = heartRate;
    this.heartRateReadings.push(heartRate);

    this.updateHeartRateDisplay();
    this.calculateBaseline();
    this.checkForAnxiety();

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
    }

    dismissAlert() {
        document.getElementById('anxiety-alert').classList.add('hidden');
    }

    startBreathingFromAlert() {
        this.dismissAlert();
        this.startBreathingExercise();
    }

    startBreathingExercise() {
        if (this.breathingActive) return;

        this.breathingActive = true;
        this.breathingStartTime = Date.now();
        this.breathingPhase = 'inhale';
        
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
