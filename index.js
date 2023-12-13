const { Plugin, openTab, Menu, getFrontend } = require('siyuan');

const TAB_TYPE = 'devtool-plugin';
const version = window.siyuan.config.system.kernelVersion;

const addScriptSync = (path, id) => {
    if (document.getElementById(id)) {
        return false;
    }
    const xhrObj = new XMLHttpRequest();
    xhrObj.open("GET", path, false);
    xhrObj.setRequestHeader("Accept",
        "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript, */*; q=0.01");
    xhrObj.send("");
    const scriptElement = document.createElement("script");
    scriptElement.type = "text/javascript";
    scriptElement.text = xhrObj.responseText;
    scriptElement.id = id;
    document.head.appendChild(scriptElement);
};

const Constants = {
    AliyunServer: "https://siyuan-sync.b3logfile.com", // 云端服务地址，阿里云负载均衡，用于接口，数据同步文件上传、下载会走七牛云 OSS SiYuanSyncServer
    SiYuanSyncServer: "https://siyuan-data.b3logfile.com/", // 云端数据同步服务地址，七牛云 OSS，用于数据同步文件上传、下载
    BazaarStatServer: "http://bazaar.b3logfile.com", // 集市包统计服务地址，直接对接 Bucket 没有 CDN 缓存
    BazaarOSSServer: "https://oss.b3logfile.com", // 云端对象存储地址，七牛云，仅用于读取集市包
    LiandiServer: "https://ld246.com", // 链滴服务地址，用于分享发布帖子
};

const URLS = {
    DOWNLOAD_COUNTS: `${Constants.BazaarStatServer}/bazaar/index.json`,
};

class VersionManager {
    constructor() {
        this.version = null;
        this.bazaarHash = '';
        this.downloadCounts = null;
        this.plugins = null;
        this.templates = null;
        this.themes = null;
        this.widgets = null;
    }

    async init() {
        await this.getDownloadCounts();
        await this.getSiyuanVersions();
        await this.getResources();
    }

    getUserRepos() {
        return [...this.plugins, ...this.templates, ...this.themes, ...this.widgets].map((p) => {
            const reponame = p?.url.split('@')[0];
            const author = reponame.split('/')[0];
            return {
                ...p,
                username: author,
                type: p.type,
                downloads: this.downloadCounts[reponame]?.downloads || 0,
            }
        });
    }

    async getSiyuanVersions() {
        this.version = await fetch(`${Constants.AliyunServer}/apis/siyuan/version?ver=${version}`, { method: 'GET' }).then((res) => res.json())
        this.bazaarHash = this.version.bazaar;
    }

    async getResources() {
        return Promise.all([
            fetch(`${Constants.BazaarOSSServer}/bazaar@${this.bazaarHash}/stage/plugins.json`).then((res) => res.json()),
            fetch(`${Constants.BazaarOSSServer}/bazaar@${this.bazaarHash}/stage/templates.json`).then((res) => res.json()),
            fetch(`${Constants.BazaarOSSServer}/bazaar@${this.bazaarHash}/stage/themes.json`).then((res) => res.json()),
            fetch(`${Constants.BazaarOSSServer}/bazaar@${this.bazaarHash}/stage/widgets.json`).then((res) => res.json()),
        ]).then((arr) => {
            this.plugins = arr[0].repos.map((v) => ({...v, type: 'plugin' }));
            this.templates = arr[1].repos.map((v) => ({...v, type: 'template' }));
            this.themes = arr[2].repos.map((v) => ({...v, type: 'theme' }));
            this.widgets = arr[3].repos.map((v) => ({...v, type: 'widget' }));
        });
    }

    async getDownloadCounts() {
        const res = await fetch(`${URLS.DOWNLOAD_COUNTS}`, { method: 'GET' }).then((res) => res.json())
        this.downloadCounts = res;
    }
}

class DevlToolComponent {
    constructor(plugin) {
        this.plugin = plugin;
    }

    init(el) {
        this.addVue();
        this.el = el;
        this.setUsername(this.plugin.config.username);
        this.mountEl();
    }

    setUsername(username) {
        this.username = username;
    }

    updateUsername(username) {
        this.plugin.setUsername(username);
    }

    addVue() {
        addScriptSync('/plugins/siyuan-plugin-devtool/vue.js', 'vue');
        addScriptSync('/plugins/siyuan-plugin-devtool/echarts.js', 'echarts');
    }

    mountEl() {
        const c = this;
        Vue.createApp({
            data: () => {
                return {
                    vm: new VersionManager(),
                    echart: null,
                    username: c.username || '',
                    userRepos: [],
                    selectedRankType: 'all',
                    types: ['all', 'plugin', 'template', 'widget', 'theme']
                };
            },
            async mounted() {
                await this.vm.init();
                this.userRepos = await this.vm.getUserRepos();
                const el = this.$el.querySelector('#echarts');
                this.echart = echarts.init(el);
                this.updateEcharts();
            },
            methods: {
                updateEcharts() {
                    let repos;
                    if (this.selectedRankType === 'all') {
                        repos = this.userRepos;
                    } else {
                        repos = this.userRepos.filter((v) => v.type === this.selectedRankType);
                    }
                    const total = {};
                    repos.forEach((p) => {
                        total[p.username] = total[p.username] ? (total[p.username] + p.downloads) : p.downloads;
                    });
                    const entries = Object.entries(total);
                    const sorted = entries.sort((a, b) => b[1] - a[1]);
                    const option = {
                        tooltip: {
                            show: true,
                        },
                        xAxis: {
                            data: sorted.map(s => s[0]),
                        },
                        yAxis: {
                            show: true,
                        },
                        series: [{
                            name: 'Rank',
                            type: 'bar',
                            data: sorted.map(s => s[1]),
                        }]
                    };
                    this.echart.setOption(option)
                    this.echart.on('click', (e) => {
                        this.username = e.name;
                    })
                },
                refresh() {
                    this.userRepos = this.vm.getUserRepos();
                    this.updateEcharts();
                },
                async update() {
                    c.updateUsername(this.username);
                },
                getStyle(type) {
                    return {
                        color: 'white',
                        backgroundColor: ['red', 'blue', 'orange', 'green'][
                            ['theme', 'template', 'plugin', 'widget'].findIndex((v) => v === type)
                        ],
                        border: '0',
                        borderRadius: '4px',
                        padding: '2px 4px',
                        display: 'inline-block',
                    }
                }
            },
            computed: {
                total() {
                    return this.namedUserRepos.reduce((a, i) => (i.downloads || 0) + a, 0);
                },
                namedUserRepos() {
                    let result = this.userRepos;
                    if (this.username) {
                        result = result.filter((v) => v.username === this.username);
                    }
                    if (this.selectedRankType !== 'all') {
                        result = result.filter((v) => v.type === this.selectedRankType);
                    }
                    return result.sort((a, b) => b.downloads - a.downloads);
                }
            },
            watch: {
                selectedRankType() {
                    this.updateEcharts();
                }
            },
            template: `
            <div class="devtool-plugin-tab" style="padding: 12px">
                <h1>Developer Tools</h1>
                <div style="margin: 12px 0 5px">
                    <span>username:</span>
                    <input class="b3-input" style="margin: 0 12px;" v-model="username"/>
                    <button class="b3-button" v-on:click="update">Save</button>
                </div>
                <div>
                    <button class="b3-button" style="margin-right: 8px" v-for="t in types" @click="selectedRankType = t">{{t}}</button>
                </div>
                <div style="display: flex; flex-wrap: wrap;">
                    <h2 style="margin: 12px 0 5px; width: 100%">Repos</h2>
                    <div style="margin: 6px 0; width: 100%">Total Downloads: {{total}}</div>
                    <div style="margin: 6px 0; width: 100%">Total Count: {{ namedUserRepos.length }}</div>
                    <div class="user-repo-container">
                        
                        <template v-for="p in namedUserRepos">
                            <div class="user-repo" v-if="p.package">
                                <div><dt>Name:&nbsp</dt><dd style="display: inline-block"><a :href="p.package.url" target="_blank">{{p.package.displayName['zh_CN'] || p.package.displayName['default'] || p.package.name}}</a></dd></div>
                                <div v-if="!username"><dt>Username:&nbsp</dt><dd style="display: inline-block">{{p.username}}</dd></div>
                                <div><dt>Type:&nbsp</dt><dd :style="getStyle(p.type)">{{p.type}}</dd></div>
                                <div><dt>Download:&nbsp</dt><dd style="display: inline-block">{{p.downloads}}</dd></div>
                                <div><dt>Version:&nbsp</dt><dd style="display: inline-block">{{p.package.version}}</dd></div>
                            </div>
                        </template>
                    </div>
                </div>
                <div style="margin: 12px 0 5px">
                    <h2>Rank</h2>
                    
                    <div id="echarts" ref="echarts" style="width: 100%; height: 400px"></div>
                </div>
            </div>
            `
        }).mount(this.el);
    }
}


module.exports = class DevToolPlugin extends Plugin {
    isMobile = false;

    onload() {
        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

        this.devtoolComponent = new DevlToolComponent(this);
        this.loadConfig().then(() => {
            if (this.config.vconsole) {
                this.toggleVconsole(this.config.vconsole);
            }
        });

        this.addIcons(`<symbol id="iconDevtools" viewBox="0 0 1024 1024">
            <path d="M150.165819 602.086957c-29.618166 0-36.488025-1.49063-36.682455-33.182715-0.25924-55.516238 0.32405-110.779718 1.74987-165.783958a3.953409 3.953409 0 0 1 4.212649-3.888599l21.322487 1.296199c2.46278 0.12962 4.037662-0.991593 4.73113-3.370119 28.814522-97.04 72.755696-186.652775 131.823522-268.831844C328.911775 56.646071 393.656956-16.394789 494.047632 3.242638 620.945595 28.000055 727.622841 120.419102 800.404461 223.402178c3.454373 4.970926 10.667725 8.969703 21.646537 11.989849 108.103065 29.877406 108.815975 181.079115 7.064289 220.35397-2.035034 0.77772-3.04607 2.229464-3.04607 4.342269l0.32405 125.536953a12.573138 12.573138 0 0 1-8.425298 11.925039l-36.488026 12.573138c-1.905414 0.6481-2.812754 1.970224-2.722019 3.95341 0.686986 21.218791 1.011036 42.256114 0.97215 63.124931-0.19443 211.475001-180.495826 394.692847-398.062966 328.975515-129.749602-39.210045-219.38182-157.812329-227.22383-293.39483-1.646174-27.997916-1.81468-63.617487-0.518479-106.871675 0.038886-2.547033-1.211947-3.823789-3.75898-3.82379zM445.440139 58.395941c-16.033992 7.044846-27.978473 13.376782-35.839925 18.989327-15.340525 10.978813-30.460696 25.081467-45.366994 42.320925-34.440029 39.663715-63.040678 81.103223-85.808428 124.305563-26.442476 48.698227-48.024203 97.539037-64.745182 146.53539a2.709058 2.709058 0 0 0 0.337012 2.410931c0.492556 0.693467 1.283238 1.10177 2.119287 1.088808l61.245442 0.6481 318.476297 0.6481 72.91124-0.77772a3.11088 3.11088 0 0 0 2.981259-3.823789c-7.712389-32.145756-13.415668-72.58719-29.099686-100.585107-21.08269-37.499061-34.414105-61.867618-39.987764-73.10567-10.304789-20.609577-4.018219-53.144193 28.257156-36.163975 24.284304 12.832378 43.163454 36.682455 56.643932 71.550231 2.119287 5.489406 6.072696 7.647579 11.860229 6.480999l25.923996-5.37923a6.610619 6.610619 0 0 0 4.34227-9.851118c-29.378369-49.644453-72.172406-92.652363-128.388593-129.036693-53.403433-34.608535-105.355122-53.358066-155.868029-56.255072z m391.964346 284.613076c-0.149063-14.063768-6.500442-27.479436-17.667204-37.304631s-26.222122-15.256272-41.867254-15.087766c-15.638651 0.162025-30.577354 5.90419-41.536723 15.962701-10.952889 10.058511-17.025585 23.603799-16.876522 37.667567 0.142582 14.057287 6.500442 27.479436 17.660723 37.304631 11.166761 9.825195 26.228603 15.249791 41.867254 15.087766 15.638651-0.162025 30.583835-5.90419 41.543204-15.962701 10.952889-10.058511 17.019104-23.61028 16.876522-37.667567zM692.489345 546.091125l69.86517-3.56455a4.731129 4.731129 0 0 0 4.536699-4.795939l-0.453669-67.661631c0-2.028553-0.97215-3.259943-2.91645-3.694169-30.804189-7.213352-58.912282-9.870562-84.317799-7.971629l-502.601482-0.58329c-3.927485 0-5.871785 1.9443-5.832899 5.832899l0.45367 80.169959c0 1.471187 1.218428 2.65721 2.72202 2.65721l518.54474-0.38886zM406.943004 948.17231c126.249863 42.904214 256.777185-57.421652 296.24647-171.292807 17.369078-50.162933 16.850598-109.075215 13.480478-163.450797a3.694169 3.694169 0 0 0-3.758979-3.43493l-175.570266 1.23139-317.180097-1.03696c-2.287793 0-3.49974 1.147137-3.62936 3.43493-1.9443 34.478915-1.36101 70.798434 1.74987 108.945595 8.554919 103.695986 86.326908 200.975783 188.661884 225.603579z" fill="#312E2E" p-id="6902"></path><path d="M595.864129 395.343085c-7.952186-32.100389-18.950441-67.227404-32.988286-105.381046-10.155726-27.518322-32.62535-91.252468-67.402391-191.189474-7.433706-21.21231-24.109317-34.673345-50.033313-40.376624 50.506426 2.897007 102.464596 21.646537 155.868029 56.255072 56.209705 36.384329 99.003743 79.392239 128.388593 129.036693a6.610619 6.610619 0 0 1-4.34227 9.851118l-25.923996 5.37923c-5.794013 1.16658-9.747423-0.991593-11.860229-6.480999-13.480478-34.867775-32.36611-58.717852-56.643932-71.550231-32.275376-16.980218-38.561945 15.554398-28.257156 36.163975 5.573659 11.238052 18.898593 35.606609 39.987764 73.10567 15.684018 27.997916 21.387297 68.439351 29.099686 100.585107a3.11088 3.11088 0 0 1-2.981259 3.823789L595.864129 395.343085z" fill="#D24B36" p-id="6903"></path><path d="M445.440139 58.395941c25.923996 5.703279 42.599607 19.164314 50.033313 40.376624 34.777041 99.937006 57.246665 163.671152 67.402391 191.189474 14.037844 38.153642 25.0361 73.280657 32.988286 105.381046l-318.476297-0.6481c-1.55544-39.534095-3.17569-78.031229 0-116.722794 0.861973-10.888079 1.205466-22.203903 1.03696-33.960435 22.76775-43.20234 51.368399-84.641849 85.808428-124.305563 14.906298-17.239458 30.026469-31.342112 45.366994-42.320925 7.861452-5.612545 19.805933-11.944481 35.839925-18.989327z" fill="#FE5A41" p-id="6904"></path><path d="M278.424792 244.011756a362.119345 362.119345 0 0 1-1.03696 33.960435c-3.17569 38.691565-1.55544 77.1887 0 116.722794l-61.245442-0.6481a2.553514 2.553514 0 0 1-2.125768-1.088808 2.696096 2.696096 0 0 1-0.343493-2.410931c16.720978-48.996353 38.302705-97.837163 64.745182-146.53539z" fill="#FCC3B0" p-id="6905"></path><path d="M719.453535 344.242375a53.014573 58.977092 89.4 1 0 117.947717-1.23519 53.014573 58.977092 89.4 1 0-117.947717 1.23519Z" fill="#FEFEFE" p-id="6906"></path><path d="M679.209777 458.403207l13.286049 87.687918-518.54474 0.38886a2.689615 2.689615 0 0 1-2.72202-2.65721l-0.45367-80.169959c-0.045367-3.888599 1.898933-5.832899 5.832899-5.832899l502.601482 0.58329z" fill="#FEFEFE" p-id="6907"></path><path d="M692.495826 546.091125L679.209777 458.403207c25.405517-1.898933 53.507129 0.758277 84.317799 7.971629 1.9443 0.434227 2.91645 1.665617 2.91645 3.694169l0.453669 67.661631a4.731129 4.731129 0 0 1-4.536699 4.795939l-69.86517 3.56455z" fill="#C4C4C4" p-id="6908"></path><path d="M537.340707 611.225166l74.790729 1.23139a8.490109 8.490109 0 0 1 8.360489 7.971629l3.69417 63.124931c-8.425299-9.157652-16.137688-13.869338-23.137167-14.128578-69.217071-2.20354-61.893542 98.251947 2.78683 96.761317-13.221238 46.533574-37.810149 86.715768-73.75377 120.546584-23.072357 21.646537-48.607493 36.727822-76.60541 45.237373-20.914184 6.351379-36.423215 11.756532-46.533574 16.202498-102.334976-24.627797-180.106966-121.907593-188.661884-225.603579-3.11088-38.147161-3.694169-74.46668-1.74987-108.945595 0.12962-2.287793 1.335086-3.43493 3.62936-3.43493l317.180097 1.03696z m-158.98539 80.208845c-7.012441-8.943779-17.544065-14.5304-29.287635-15.534955-11.730608-1.004555-23.720457 2.65721-33.312335 10.175169-19.961477 15.658094-24.32319 43.442137-9.721499 62.062047 7.012441 8.943779 17.544065 14.5304 29.281154 15.534955 11.737089 1.004555 23.720457-2.65721 33.312335-10.175168 19.967958-15.658094 24.32319-43.448618 9.721499-62.062048z" fill="#FEC899" p-id="6909"></path><path d="M406.943004 948.17231c10.110359-4.445965 25.61939-9.851119 46.533574-16.202498 27.997916-8.509552 53.533053-23.590837 76.60541-45.237373 35.943621-33.830815 60.532532-74.01301 73.75377-120.546584 17.712571-9.462259 27.609056-23.461217 29.682976-41.996874 1.55544-14.037844-1.55544-27.583132-9.332639-40.635865l-3.69417-63.124931a8.490109 8.490109 0 0 0-8.360489-7.971629l-74.790729-1.23139 175.570266-1.23139a3.694169 3.694169 0 0 1 3.758979 3.43493c3.37012 54.375583 3.888599 113.287865-13.480478 163.450797-39.469285 113.871155-169.996607 214.197021-296.24647 171.292807z" fill="#E4A276" p-id="6910"></path><path d="M624.186095 683.553116c7.777199 13.052732 10.888079 26.59802 9.332639 40.635865-2.07392 18.535657-11.970405 32.534616-29.682976 41.996874-64.680371 1.49063-72.0039-98.964857-2.78683-96.761317 6.999479 0.25924 14.711868 4.970926 23.137167 14.128578z" fill="#312E2E" p-id="6911"></path><path d="M306.032835 748.138874a42.839404 45.950284 51.9 1 0 72.319775-56.705947 42.839404 45.950284 51.9 1 0-72.319775 56.705947Z" fill="#312E2E" p-id="6912"></path>
        </symbol>`)

        this.registerTopbarIcon();
      
        this.addCommand({
            langKey: "reload",
            hotkey: "⇧⌘R",
            callback: () => {
                window.location.reload();
            }
        });

        let component = this.devtoolComponent;
        this.addTab({
            type: TAB_TYPE,
            init() {
                component.init(this.element);
            }
        });
    }

    registerTopbarIcon() {
        const topBarElement = this.addTopBar({
            title: this.i18n.title,
            icon: 'iconDevtools',
            position: 'right',
            callback: () => {
                let rect = topBarElement.getBoundingClientRect();
                // 如果被隐藏，则使用更多按钮
                if (rect.width === 0) {
                    rect = document.querySelector("#barMore").getBoundingClientRect();
                }
                this.showMenu(rect);
            },
        });
    }

    showMenu(rect) {
        const menu = new Menu("siyuanPluginDevtool");
        menu.addItem({
            icon: "iconRefresh",
            label: this.i18n.reload,
            click: () => window.location.reload(),
        });
        if (window.require) {
            menu.addItem({
                icon: 'iconFolder',
                label: this.i18n.openPluginFolder,
                click: () => this.showPluginFolder(),
            });
        }
        menu.addItem({
            icon: "iconDevtools",
            label: this.i18n.developerPanel,
            click: () => this.showDevTool(),
        });
        menu.addSeparator();
        if (window.require) {
            menu.addItem({
                icon: 'iconBug',
                label: this.i18n.openElectronDevTools,
                click: () => this.openElectronDevTools(),
            })
        }
        menu.open({
            x: rect.right,
            y: rect.bottom,
            isLeft: true,
        });
        if (true) {
            menu.addItem({
                icon: "iconBug",
                label: this.i18n.vConsole,
                click: () => {
                    this.toggleVconsole();
                    this.saveConfig();
                }
            })
        }
    }

    toggleVconsole(initial) {
        addScriptSync("/plugins/siyuan-plugin-devtool/vconsole.min.js", "vconsole");
        if (initial === false) {
            return;
        }
        if (this.VConsole) {
            this.VConsole.destroy();
            this.VConsole = null;
            this.config.vconsole = false;
        } else {
            this.VConsole = new window.VConsole();
            this.config.vconsole = true;
        }
    }

    showDevTool() {
        openTab({
            app: this.app,
            custom: {
                icon: 'iconDevtools',
                title: this.i18n.developerPanel,
                data: {},
                id: this.name + TAB_TYPE,
            },
        });
    }

    openElectronDevTools() {
        if (!window.require) {
            return;
        }
        const remote = window.require('@electron/remote');
        remote?.getCurrentWindow().webContents.openDevTools()
    }

    showPluginFolder() {
        if (!window.require) {
            return;
        }
        const path = window.require('path');
        const {shell} = window.require('@electron/remote') // deconstructing assignment
        const absPath = path.join(window.siyuan.config.system.workspaceDir, 'data', 'plugins')
        // shell.showItemInFolder(absPath);
        shell.openExternal('file://' + encodeURI(absPath));
    }

    async setUsername(username) {
        this.config.username = username;
        this.saveConfig();
    }

    async saveConfig() {
        await this.saveData('config.json', JSON.stringify(this.config));
    }

    async loadConfig() {
        this.config = await this.loadData('config.json');
        if (!this.config) {
            this.config = {
                'username': '',
                'vconsole': false,
            };
            this.saveConfig();
        } else {
            this.devtoolComponent.setUsername(this.config.username);
        }
    }
}