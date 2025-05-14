const axios = require('axios');

// 创建一个带有默认配置的 axios 实例
const qqMusicApi = axios.create({
    timeout: 10000, // 10秒超时
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://y.qq.com'
    }
});

// 添加重试机制
async function retryRequest(fn, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}

// 获取QQ音乐排行榜数据
async function fetchQQMusicTop(topId = 26) {
    // topId 说明：
    // 26: 热歌榜
    // 27: 新歌榜
    // 28: 网络歌曲榜
    // 5: 内地榜
    // 3: 欧美榜
    // 16: 韩国榜
    // 17: 日本榜
    
    const url = 'https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg';
    const params = {
        g_tk: 5381,
        uin: 0,
        format: 'json',
        inCharset: 'utf-8',
        outCharset: 'utf-8',
        notice: 0,
        platform: 'h5',
        needNewCode: 1,
        tpl: 3,
        page: 'detail',
        type: 'top',
        topid: topId,
        _: Date.now()
    };

    try {
        const response = await retryRequest(() => qqMusicApi.get(url, { params }));
        if (!response.data || !response.data.songlist) {
            throw new Error('获取排行榜数据格式错误');
        }
        
        const songList = response.data.songlist;
        if (!Array.isArray(songList)) {
            throw new Error('排行榜数据格式错误');
        }
        
        return songList.slice(0, 20).map((item, index) => {
            if (!item.data) return null;
            
            return {
                rank: index + 1,
                name: item.data.songname || '未知歌曲',
                singer: Array.isArray(item.data.singer) 
                    ? item.data.singer.map(s => s.name || '未知歌手').join('/') 
                    : '未知歌手',
                albumname: item.data.albumname || '未知专辑',
                duration: item.data.interval 
                    ? Math.floor(item.data.interval / 60) + ':' + 
                      (item.data.interval % 60).toString().padStart(2, '0')
                    : '未知时长'
            };
        }).filter(Boolean);
    } catch (error) {
        console.error('获取QQ音乐数据失败:', error);
        throw new Error('获取排行榜数据失败，请稍后再试');
    }
}

// 搜索歌曲
async function searchSong(keyword) {
    const url = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp';
    const params = {
        g_tk: 5381,
        uin: 0,
        format: 'json',
        inCharset: 'utf-8',
        outCharset: 'utf-8',
        notice: 0,
        platform: 'h5',
        needNewCode: 1,
        w: keyword,
        zhidaqu: 1,
        catZhida: 1,
        t: 0,
        flag: 1,
        ie: 'utf-8',
        sem: 1,
        aggr: 0,
        perpage: 10,
        n: 10,
        p: 1,
        remoteplace: 'txt.mqq.all',
        _: Date.now()
    };

    try {
        const response = await retryRequest(() => qqMusicApi.get(url, { params }));
        if (!response.data || !response.data.data || !response.data.data.song || !response.data.data.song.list) {
            throw new Error('搜索结果格式错误');
        }

        const list = response.data.data.song.list;
        return list.map((item, index) => ({
            rank: index + 1,
            name: item.songname || '未知歌曲',
            singer: Array.isArray(item.singer) 
                ? item.singer.map(s => s.name || '未知歌手').join('/') 
                : '未知歌手',
            albumname: item.albumname || '未知专辑'
        }));
    } catch (error) {
        console.error('搜索歌曲失败:', error);
        throw new Error('搜索歌曲失败，请稍后再试');
    }
}

// 获取歌词
async function getLyrics(songName, singer) {
    const url = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp';
    const params = {
        g_tk: 5381,
        uin: 0,
        format: 'json',
        inCharset: 'utf-8',
        outCharset: 'utf-8',
        notice: 0,
        platform: 'h5',
        needNewCode: 1,
        w: `${songName} ${singer}`,
        zhidaqu: 1,
        catZhida: 1,
        t: 0,
        flag: 1,
        ie: 'utf-8',
        sem: 1,
        aggr: 0,
        perpage: 1,
        n: 1,
        p: 1,
        remoteplace: 'txt.mqq.all',
        _: Date.now()
    };

    try {
        // 先搜索歌曲获取 songmid
        const searchResponse = await axios.get(url, { params });
        const songList = searchResponse.data.data.song.list;
        if (songList.length === 0) {
            throw new Error('未找到该歌曲');
        }

        const songmid = songList[0].songmid;
        
        // 获取歌词
        const lyricsUrl = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg';
        const lyricsParams = {
            songmid: songmid,
            g_tk: 5381,
            format: 'json',
            inCharset: 'utf-8',
            outCharset: 'utf-8',
            notice: 0,
            platform: 'h5',
            needNewCode: 1,
        };

        const lyricsResponse = await axios.get(lyricsUrl, {
            params: lyricsParams,
            headers: {
                Referer: 'https://y.qq.com'
            }
        });

        if (lyricsResponse.data.lyric) {
            // 解码歌词
            const decodedLyrics = Buffer.from(lyricsResponse.data.lyric, 'base64').toString();
            return decodedLyrics;
        } else {
            throw new Error('暂无歌词');
        }
    } catch (error) {
        console.error('获取歌词失败:', error);
        throw new Error('获取歌词失败，请稍后再试');
    }
}

// 格式化排行榜数据
function formatRankData(songs, title) {
    let result = `🎵 QQ音乐${title} Top 20:\n`;
    result += '======================\n';
    
    songs.forEach(song => {
        result += `${song.rank}. ${song.name}\n`;
        result += `   歌手: ${song.singer}\n`;
        result += `   专辑: ${song.albumname}\n`;
        result += `   时长: ${song.duration}\n`;
        if (!isNaN(song.popularity)) {
            result += `   热度: ${song.popularity.toFixed(1)}%\n`;
        }
        result += '----------------------\n';
    });
    
    return result;
}

// 格式化搜索结果
function formatSearchData(songs, keyword) {
    let result = `🔍 搜索结果: "${keyword}"\n`;
    result += '======================\n';
    
    songs.forEach(song => {
        result += `${song.rank}. ${song.name}\n`;
        result += `   歌手: ${song.singer}\n`;
        result += `   专辑: ${song.albumname}\n`;
        result += '----------------------\n';
    });
    
    return result;
}

// 格式化歌词数据
function formatLyricsData(lyrics, songName, singer) {
    let result = `🎵 ${songName} - ${singer} 的歌词:\n`;
    result += '======================\n';
    result += lyrics + '\n';
    result += '======================\n';
    return result;
}

// 获取并返回排行榜数据
async function getRankData(type = 'hot') {
    try {
        let topId;
        let title;
        
        switch (type.toLowerCase()) {
            case 'hot':
                topId = 26;
                title = '热歌榜';
                break;
            case 'new':
                topId = 27;
                title = '新歌榜';
                break;
            case 'network':
                topId = 28;
                title = '网络歌曲榜';
                break;
            case 'mainland':
                topId = 5;
                title = '内地榜';
                break;
            case 'western':
                topId = 3;
                title = '欧美榜';
                break;
            case 'korea':
                topId = 16;
                title = '韩国榜';
                break;
            case 'japan':
                topId = 17;
                title = '日本榜';
                break;
            default:
                topId = 26;
                title = '热歌榜';
        }

        const songs = await fetchQQMusicTop(topId);
        if (!songs || songs.length === 0) {
            return '暂无数据';
        }
        return formatRankData(songs, title);
    } catch (error) {
        return `Error: ${error.message}`;
    }
}

// 获取并返回搜索结果
async function getSearchData(keyword) {
    try {
        const songs = await searchSong(keyword);
        return formatSearchData(songs, keyword);
    } catch (error) {
        return `Error: ${error.message}`;
    }
}

// 获取并返回歌词数据
async function getLyricsData(songName, singer) {
    try {
        const lyrics = await getLyrics(songName, singer);
        return formatLyricsData(lyrics, songName, singer);
    } catch (error) {
        return `Error: ${error.message}`;
    }
}

// 导出函数供 MCP 使用
module.exports = {
    getRankData,
    getSearchData,
    getLyricsData
};