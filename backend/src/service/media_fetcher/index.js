const logger = require('consola');
const os = require('os');
const md5 = require('md5');
const path = require('path');
const cmd = require('../../utils/cmd');
const fs = require('fs');
const configManager = require('../config_manager')
const downloadFile = require('../../utils/download');

const { getBinPath } = require('./media_get');

const basePath = path.join(os.tmpdir(), 'melody-tmp-songs');
// create path if not exists
if (!fs.existsSync(basePath)) {
    fs.mkdirSync(basePath);
}
logger.info(`[tmp path] use ${basePath}`)


async function downloadViaSourceUrl(url) {
    logger.info(`downloadViaSourceUrl params: url: ${url}`);

    const requestHash = md5(url);
    const downloadPath = `${basePath}/${requestHash}.mp3`;
    logger.info(`start download from ${url}`);


    const isSucceed = await downloadFile(url, downloadPath);
    if (!isSucceed) {
        logger.error(`download failed with ${url}`);
        return false;
    }

    if (!fs.existsSync(downloadPath)) {
        logger.error(`download failed with ${url}, the file not exists ${downloadPath}`);
        return false;
    }
    logger.info(`download success, path: ${downloadPath}`);
    return downloadPath;
}

async function fetchWithUrl(url, {
    songName = "",
    addMediaTag = false,
}) {
    logger.info(`fetchWithUrl params: ${JSON.stringify(arguments)}`);
    if (songName) {
        songName = songName.replace(/ /g, '').replace(/\./g, '').replace(/\//g, '').replace(/"/g, '');
    }
    const requestHash = md5(`${url}${songName}${addMediaTag}`);
    const fileBasePath = `${basePath}/${requestHash}`;
    try {
        fs.mkdirSync(fileBasePath, { recursive: true });
    } catch (err) {
        logger.error('create dir failed', err);
        return false;
    }

    addMediaTag = false; // todo: 等到 media-get fix 偶现的 添加 addMediaTag 后 panic 的问题，再移除这行代码
    const downloadPath = `${fileBasePath}/${songName ? songName : requestHash}.mp3`;
    logger.info(`start parse and download from ${url}`);

    let args = ['-u', `"${url}"`, '--out', `${downloadPath}`, '-t', 'audio', `${addMediaTag ? '--addMediaTag' : ''}`];

    logger.info(`${getBinPath()} ${args.join(' ')}`);

    const {code, message} = await cmd(getBinPath(), args);
    logger.info('-------')
    logger.info(code);
    logger.info(message);
    logger.info('-------')
    if (code != 0) {
        return false;
    }

    if (!fs.existsSync(downloadPath)) {
        return false;
    }
    return downloadPath;
}

async function getMetaWithUrl(url) {
    logger.info(`getMetaWithUrl from ${url}`);

    let args = ['-u', `"${url}"`, '-m', '--infoFormat=json', '-l=silence'];

    const {code, message} = await cmd(getBinPath(), args);
    logger.info('-------')
    logger.info(code);
    // logger.info(message);
    logger.info('-------')
    if (code != 0) {
        logger.error(`getMetaWithUrl failed with ${url}, err: ${message}`);
        return false;
    }

    let meta;
    try {
        meta = JSON.parse(message);
    } catch (e) {
        logger.error(e, message)
        return false;
    }

    return {
        songName: meta.title,
        artist: meta.artist,
        album: meta.album,
        duration: meta.duration,
        coverUrl: meta.cover_url,
        publicTime: meta.public_time,
        isTrial: meta.is_trial,
        resourceType: meta.resource_type,
        audios: meta.audios,
        fromMusicPlatform: meta.from_music_platform,
        resourceForbidden: meta.resource_forbidden,
        source: meta.source
    }
}

async function searchSongFromAllPlatform({
    keyword,
    songName, artist, album
}) {
    logger.info(`searchSong with ${JSON.stringify(arguments)}`);

    const globalConfig = await configManager.getGlobalConfig();

    let searchParams = keyword 
        ? ['-k', `"${keyword}"`] 
        : ['--searchSongName', `"${songName}"`, '--searchArtist', `"${artist}"`, '--searchAlbum', `"${album}"`];
    searchParams = searchParams.concat([
        '--searchType="song"',
        '-m',
        `--sources=${globalConfig.sources.join(',')}`,
        '--infoFormat=json',
        '-l', 'silence'
    ]);

    logger.info(`cmdStr: ${getBinPath()} ${searchParams.join(' ')}`);

    const {code, message} = await cmd(getBinPath(), searchParams);
    logger.info('-------')
    logger.info(code);
    // logger.info(message);
    logger.info('-------')
    if (code != 0) {
        logger.error(`searchSong failed with ${arguments}, err: ${message}`);
        return false;
    }

    let jsonResponse;
    try {
        jsonResponse = JSON.parse(message);
    } catch (e) {
        logger.error(e, message)
        return false;
    }

    return jsonResponse.map(searchItem => {
        return {
            songName: searchItem.Name,
            artist: searchItem.Artist,
            album: searchItem.Album,
            duration: searchItem.Duration,
            url: searchItem.Url,
            resourceForbidden: searchItem.ResourceForbidden,
            source: searchItem.Source,
            fromMusicPlatform: searchItem.FromMusicPlatform,
            score: searchItem.Score,
        }
    })
}

module.exports = {
    downloadViaSourceUrl: downloadViaSourceUrl,
    fetchWithUrl: fetchWithUrl,
    getMetaWithUrl: getMetaWithUrl,
    searchSongFromAllPlatform: searchSongFromAllPlatform,
}