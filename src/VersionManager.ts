const Constants = {
    AliyunServer: "https://siyuan-sync.b3logfile.com", // 云端服务地址，阿里云负载均衡，用于接口，数据同步文件上传、下载会走七牛云 OSS SiYuanSyncServer
    SiYuanSyncServer: "https://siyuan-data.b3logfile.com/", // 云端数据同步服务地址，七牛云 OSS，用于数据同步文件上传、下载
    BazaarStatServer: "http://bazaar.b3logfile.com", // 集市包统计服务地址，直接对接 Bucket 没有 CDN 缓存
    BazaarOSSServer: "https://oss.b3logfile.com", // 云端对象存储地址，七牛云，仅用于读取集市包
    LiandiServer: "https://ld246.com", // 链滴服务地址，用于分享发布帖子
};

const version = (window.siyuan as any).config.system.kernelVersion;

const URLS = {
    DOWNLOAD_COUNTS: `${Constants.BazaarStatServer}/bazaar/index.json`,
};

export class VersionManager {
    version;
    bazaarHash
    downloadCounts
    plugins
    templates
    themes
    widgets

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
            this.plugins = arr[0].repos.map((v) => ({ ...v, type: 'plugin' }));
            this.templates = arr[1].repos.map((v) => ({ ...v, type: 'template' }));
            this.themes = arr[2].repos.map((v) => ({ ...v, type: 'theme' }));
            this.widgets = arr[3].repos.map((v) => ({ ...v, type: 'widget' }));
        });
    }

    async getDownloadCounts() {
        const res = await fetch(`${URLS.DOWNLOAD_COUNTS}`, { method: 'GET' }).then((res) => res.json())
        this.downloadCounts = res;
    }
}