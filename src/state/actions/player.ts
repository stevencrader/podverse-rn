import AsyncStorage from '@react-native-community/async-storage'
import {
  convertNowPlayingItemClipToNowPlayingItemEpisode,
  convertNowPlayingItemToEpisode,
  convertNowPlayingItemToMediaRef,
  NowPlayingItem
} from 'podverse-shared'
import Config from 'react-native-config'
import { getGlobal, setGlobal } from 'reactn'
import { getParsedTranscript } from '../../lib/transcriptHelpers'
import { convertPodcastIndexValueTagToStandardValueTag } from '../../lib/valueTagHelpers'
import { PV } from '../../resources'
import PVEventEmitter from '../../services/eventEmitter'
import {
  playerHandlePlayWithUpdate,
  playerLoadNowPlayingItem as playerLoadNowPlayingItemService,
  playerSetPosition,
  playerSetPlaybackSpeed as playerSetPlaybackSpeedService,
  playerTogglePlay as playerTogglePlayService,
  playerGetState,
  playerGetDuration
} from '../../services/player'
import { getPodcastFromPodcastIndexById } from '../../services/podcastIndex'
import { initSleepTimerDefaultTimeRemaining } from '../../services/sleepTimer'
import { trackPlayerScreenPageView } from '../../services/tracking'
import {
  clearNowPlayingItem as clearNowPlayingItemService,
  setNowPlayingItem as setNowPlayingItemService
} from '../../services/userNowPlayingItem'
import { audioPlayNextFromQueue } from './playerAudio'
import { clearChapterPlaybackInfo, getChapterNext, getChapterPrevious, loadChapterPlaybackInfo,
  loadChaptersForNowPlayingItem, 
  setChapterOnGlobalState} from './playerChapters'
import { videoStateClearVideoInfo, videoStateSetVideoInfo } from './playerVideo'

const clearEnrichedPodcastDataIfNewEpisode =
 async (previousNowPlayingItem: NowPlayingItem, nowPlayingItem: NowPlayingItem) => {
  const shouldClearPreviousPlaybackInfo =
    previousNowPlayingItem && previousNowPlayingItem.episodeId !== nowPlayingItem.episodeId
  if (shouldClearPreviousPlaybackInfo) {
    await clearChapterPlaybackInfo(nowPlayingItem)
    setGlobal({ podcastValueFinal: null })
  }
}

export const playerUpdatePlayerState = (item: NowPlayingItem) => {
  if (!item) return

  const globalState = getGlobal()

  const episode = convertNowPlayingItemToEpisode(item)
  episode.description = episode.description || 'No show notes available'
  const mediaRef = convertNowPlayingItemToMediaRef(item)

  const newState = {
    player: {
      ...globalState.player,
      episode,
      ...(!item.clipId ? { mediaRef } : { mediaRef: null }),
      nowPlayingItem: item,
      videoInfo: videoStateSetVideoInfo(item)
    }
  } as any

  if (!item.clipId) {
    newState.screenPlayer = {
      ...globalState.screenPlayer,
      showFullClipInfo: false
    }
  }

  setGlobal(newState)
}

export const playerClearNowPlayingItem = async () => {
  await clearNowPlayingItemService()

  const globalState = getGlobal()
  setGlobal({
    player: {
      ...globalState.player,
      nowPlayingItem: null,
      playbackState: null,
      showMiniPlayer: false,
      videoInfo: videoStateClearVideoInfo()
    },
    screenPlayer: {
      ...globalState.screenPlayer,
      showFullClipInfo: false
    }
  })
}

export const hideMiniPlayer = () => {
  const globalState = getGlobal()
  setGlobal({
    player: {
      ...globalState.player,
      showMiniPlayer: false
    }
  })
}

export const showMiniPlayer = () => {
  const globalState = getGlobal()
  setGlobal({
    player: {
      ...globalState.player,
      showMiniPlayer: true
    }
  })
}

export const initPlayerState = async (globalState: any) => {
  const sleepTimerDefaultTimeRemaining = await initSleepTimerDefaultTimeRemaining()

  setGlobal({
    player: {
      ...globalState.player,
      sleepTimer: {
        defaultTimeRemaining: sleepTimerDefaultTimeRemaining,
        isActive: false,
        timeRemaining: sleepTimerDefaultTimeRemaining
      }
    }
  })
}

export const playerPlayPreviousChapterOrReturnToBeginningOfTrack = async () => {
  const globalState = getGlobal()
  const { currentChapters } = globalState

  if (currentChapters && currentChapters.length > 1) {
    const previousChapter = await getChapterPrevious()
    if (previousChapter) {
      await playerSetPosition(previousChapter.startTime)
      setChapterOnGlobalState(previousChapter)
      return
    }
  }

  await playerSetPosition(0)
}

export const playerPlayNextChapterOrQueueItem = async () => {
  const globalState = getGlobal()
  const { currentChapters } = globalState

  if (currentChapters && currentChapters.length > 1) {
    const nextChapter = await getChapterNext()
    if (nextChapter) {
      await playerSetPosition(nextChapter.startTime)
      setChapterOnGlobalState(nextChapter)
      return
    }
  }
  
  await audioPlayNextFromQueue()
}

const playerHandleLoadChapterForNowPlayingEpisode = async (item: NowPlayingItem) => {
  playerSetPosition(item.clipStartTime)
  const nowPlayingItemEpisode = convertNowPlayingItemClipToNowPlayingItemEpisode(item)
  await playerSetNowPlayingItem(nowPlayingItemEpisode, item.clipStartTime || 0)
  playerHandlePlayWithUpdate()
  loadChapterPlaybackInfo()
}

export const playerLoadNowPlayingItem = async (
  item: NowPlayingItem,
  shouldPlay: boolean,
  forceUpdateOrderDate: boolean,
  setCurrentItemNextInQueue: boolean,
  navigation: any
) => {
  const globalState = getGlobal()
  const { nowPlayingItem: previousNowPlayingItem } = globalState.player

  if (item) {
    await clearEnrichedPodcastDataIfNewEpisode(previousNowPlayingItem, item)

    item.clipId
      ? await AsyncStorage.setItem(PV.Keys.PLAYER_CLIP_IS_LOADED, 'TRUE')
      : await AsyncStorage.removeItem(PV.Keys.PLAYER_CLIP_IS_LOADED)

    if (item.clipIsOfficialChapter) {
      if (previousNowPlayingItem && item.episodeId === previousNowPlayingItem.episodeId) {
        await playerHandleLoadChapterForNowPlayingEpisode(item)
        return
      } else {
        loadChapterPlaybackInfo()
      }
    }

    playerUpdatePlayerState(item)

    const itemToSetNextInQueue = setCurrentItemNextInQueue ? previousNowPlayingItem : null

    await playerLoadNowPlayingItemService(
      item,
      shouldPlay,
      !!forceUpdateOrderDate,
      itemToSetNextInQueue,
      navigation
    )

    showMiniPlayer()
  }

  setGlobal(
    {
      screenPlayer: {
        ...globalState.screenPlayer,
        isLoading: false
      }
    },
    () => {
      handleEnrichingPlayerState(item)
    }
  )
}

export const handleEnrichingPlayerState = (item: NowPlayingItem) => {
  trackPlayerScreenPageView(item)
  loadChaptersForNowPlayingItem(item)
  enrichPodcastValue(item)
  enrichParsedTranscript(item)
}

const enrichParsedTranscript = (item: NowPlayingItem) => {
  if (item.episodeTranscript && item.episodeTranscript[0] && item.episodeTranscript[0].url) {
    setGlobal({ parsedTranscript: [] }, async () => {
      try {
        const parsedTranscript =
          await getParsedTranscript(item.episodeTranscript[0].url, item.episodeTranscript[0].type)
        setGlobal({ parsedTranscript })
      } catch (error) {
        console.log('playerLoadNowPlayingItem transcript parsing error', error)
      }
    })
  } else {
    setGlobal({ parsedTranscript: null })
  }
}

const enrichPodcastValue = async (item: NowPlayingItem) => {
  if (!Config.ENABLE_VALUE_TAG_TRANSACTIONS) return

  if (
    item?.episodeValue?.length
    || item?.episodeValue?.recipients?.length
    || item?.podcastValue?.length
    || item?.podcastValue?.recipients?.length
  ) {
    PVEventEmitter.emit(PV.Events.PLAYER_VALUE_ENABLED_ITEM_LOADED)
  } else if (item.podcastIndexPodcastId) {
    const podcastIndexPodcast = await getPodcastFromPodcastIndexById(item.podcastIndexPodcastId)
    const podcastIndexPodcastValueTag = podcastIndexPodcast?.feed?.value
    if (podcastIndexPodcastValueTag?.model && podcastIndexPodcastValueTag?.destinations) {
      const podcastValue = convertPodcastIndexValueTagToStandardValueTag(podcastIndexPodcastValueTag)
      PVEventEmitter.emit(PV.Events.PLAYER_VALUE_ENABLED_ITEM_LOADED)
      setGlobal({ podcastValueFinal: podcastValue })
    }
  }
}

export const playerSetPlaybackSpeed = async (rate: number) => {
  await playerSetPlaybackSpeedService(rate)

  const globalState = getGlobal()
  setGlobal({
    player: {
      ...globalState.player,
      playbackRate: rate
    }
  })

  PVEventEmitter.emit(PV.Events.PLAYER_SPEED_UPDATED)
}

export const playerTogglePlay = async () => {
  // If somewhere a play button is pressed, but nothing is currently loaded in the player,
  // then load the last time from memory by re-initializing the player.
  // TODO VIDEO: check if this is needed
  // const trackId = await audioGetCurrentLoadedTrackId()
  // if (!trackId) {
  //   await audioInitializePlayerQueue()
  // }
  await playerTogglePlayService()

  showMiniPlayer()
}

export const playerUpdatePlaybackState = async (state?: any) => {
  let playbackState = state
  if (!playbackState) playbackState = await playerGetState()
  const backupDuration = await playerGetDuration()

  const globalState = getGlobal()
  setGlobal({
    player: {
      ...globalState.player,
      playbackState,
      ...(backupDuration ? { backupDuration } : {})
    }
  })
}

export const playerSetNowPlayingItem = async (item: NowPlayingItem | null, playbackPosition: number) => {
  if (item) {
    await setNowPlayingItemService(item, playbackPosition)
    playerUpdatePlayerState(item)
  }
}

export const initializePlaybackSpeed = async () => {
  const playbackSpeedString = await AsyncStorage.getItem(PV.Keys.PLAYER_PLAYBACK_SPEED)
  let playbackSpeed = 1
  if (playbackSpeedString) {
    playbackSpeed = JSON.parse(playbackSpeedString)
  }

  const globalState = getGlobal()
  setGlobal({
    player: {
      ...globalState.player,
      playbackRate: playbackSpeed
    }
  })
}
