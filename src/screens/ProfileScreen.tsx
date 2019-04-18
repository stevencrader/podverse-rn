import React from 'reactn'
import { ActivityIndicator, ClipTableCell, Divider, FlatList, PlaylistTableCell,
  PodcastTableCell, TableSectionSelectors, Text, View } from '../components'
import { generateAuthorsText, generateCategoriesText, readableDate } from '../lib/utility'
import { PV } from '../resources'
import { getPodcasts } from '../services/podcast'
import { getPublicUser, getUserMediaRefs, getUserPlaylists } from '../services/user'

type Props = {
  navigation?: any
}

type State = {
  endOfResultsReached: boolean
  flatListData: any[]
  isLoading: boolean
  isLoadingMore: boolean
  queryFrom: string | null
  queryPage: number
  querySort?: string | null
  user?: any
}

export class ProfileScreen extends React.Component<Props, State> {

  static navigationOptions = {
    title: 'Profile'
  }

  constructor(props: Props) {
    super(props)
    this.state = {
      endOfResultsReached: false,
      flatListData: [],
      isLoading: true,
      isLoadingMore: false,
      queryFrom: _podcastsKey,
      queryPage: 1,
      querySort: _alphabeticalKey,
      user: props.navigation.getParam('user')
    }
  }

  async componentDidMount() {
    const { user } = this.state
    const newUser = await getPublicUser(user.id)

    this.setState({ user: newUser }, async () => {
      let newState = {
        isLoading: false,
        isLoadingMore: false,
        queryPage: 1,
        user: newUser
      } as State

      newState = await this._queryPodcasts(newState, 1, _alphabeticalKey)
      this.setState(newState)
    })

  }

  selectLeftItem = async (selectedKey: string) => {
    const { querySort } = this.state
    if (!selectedKey) {
      this.setState({ queryFrom: null })
      return
    }

    this.setState({
      endOfResultsReached: false,
      flatListData: [],
      isLoading: true,
      queryFrom: selectedKey,
      queryPage: 1,
      ...(querySort === _alphabeticalKey && selectedKey !== _podcastsKey ? { querySort: _topPastWeek } : {})
    }, async () => {
      const newState = await this._queryData(selectedKey, 1)
      this.setState(newState)
    })
  }

  selectRightItem = async (selectedKey: string) => {
    if (!selectedKey) {
      this.setState({ querySort: null })
      return
    }

    this.setState({
      endOfResultsReached: false,
      flatListData: [],
      isLoading: true,
      querySort: selectedKey
    }, async () => {
      const newState = await this._queryData(selectedKey, 1)

      this.setState(newState)
    })
  }

  _onEndReached = ({ distanceFromEnd }) => {
    const { endOfResultsReached, isLoadingMore, queryFrom, queryPage = 1 } = this.state
    if (!endOfResultsReached && !isLoadingMore) {
      if (distanceFromEnd > -1) {
        this.setState({
          isLoadingMore: true
        }, async () => {
          const newState = await this._queryData(queryFrom, queryPage + 1)
          this.setState(newState)
        })
      }
    }
  }

  _ItemSeparatorComponent = () => {
    return <Divider />
  }

  _handlePodcastPress = (podcast: any) => {
    console.log('podcast pressed')
  }

  _handleClipPress = (clip: any) => {
    console.log('clip pressed')
  }

  _handleClipMorePress = (clip: any) => {
    console.log('clip more pressed')
  }

  _handlePlaylistPress = (playlist: any) => {
    console.log('playlist pressed')
  }

  _renderItem = ({ item }) => {
    const { queryFrom } = this.state

    if (queryFrom === _podcastsKey) {
      return (
        <PodcastTableCell
          key={item.id}
          lastEpisodePubDate={item.lastEpisodePubDate}
          onPress={() => this._handlePodcastPress(item)}
          podcastAuthors={generateAuthorsText(item.authors)}
          podcastCategories={generateCategoriesText(item.categories)}
          podcastImageUrl={item.imageUrl}
          podcastTitle={item.title} />
      )
    } else if (queryFrom === _clipsKey) {
      return (
        <ClipTableCell
          key={item.id}
          endTime={item.endTime}
          episodePubDate={readableDate(item.episode.pubDate)}
          episodeTitle={item.episode.title}
          handleMorePress={() => this._handleClipMorePress(item)}
          podcastImageUrl={item.episode.podcast.imageUrl}
          podcastTitle={item.episode.podcast.title}
          startTime={item.startTime}
          title={item.title} />
      )
    } else {
      return (
        <PlaylistTableCell
          key={item.id}
          itemCount={item.itemCount}
          onPress={() => this.props.navigation.navigate(
            PV.RouteNames.PlaylistScreen, {
              playlist: item,
              navigationTitle: 'Playlist'
            }
          )}
          title={item.title} />
      )
    }
  }

  render() {
    const { flatListData, isLoading, isLoadingMore, queryFrom, querySort } = this.state
    let rightOptions = []

    if (queryFrom === _podcastsKey) {
      rightOptions = rightItemsWithAlphabetical
    } else if (queryFrom === _clipsKey) {
      rightOptions = rightItems
    }

    return (
      <View style={styles.view}>
        <TableSectionSelectors
          handleSelectLeftItem={this.selectLeftItem}
          handleSelectRightItem={this.selectRightItem}
          leftItems={leftItems}
          rightItems={rightOptions}
          selectedLeftItemKey={queryFrom}
          selectedRightItemKey={querySort} />
        {
          isLoading &&
            <ActivityIndicator />
        }
        {
          !isLoading && queryFrom && flatListData && flatListData.length > 0 &&
            <FlatList
              data={flatListData}
              disableLeftSwipe={true}
              extraData={flatListData}
              isLoadingMore={isLoadingMore}
              ItemSeparatorComponent={this._ItemSeparatorComponent}
              onEndReached={this._onEndReached}
              renderItem={this._renderItem} />
        }
      </View>
    )
  }

  _queryPodcasts = async (newState: any, page: number = 1, sort?: string | null) => {
    const { flatListData, user } = this.state
    const query = {
      includeAuthors: true,
      includeCategories: true,
      page,
      podcastIds: user.subscribedPodcastIds,
      sort
    }

    const results = await getPodcasts(query, this.global.settings.nsfwMode)
    newState.flatListData = [...flatListData, ...results[0]]
    newState.endOfResultsReached = newState.flatListData.length >= results[1]

    return newState
  }

  _queryMediaRefs = async (newState: any, page: number = 1, sort?: string | null) => {
    const { flatListData, user } = this.state
    const { settings } = this.global
    const { nsfwMode } = settings
    const query = { page }
    const results = await getUserMediaRefs(user.id, query, nsfwMode)
    newState.flatListData = [...flatListData, ...results[0]]
    newState.endOfResultsReached = newState.flatListData.length >= results[1]
    return newState
  }

  _queryPlaylists = async (newState: any, page: number = 1, sort?: string | null) => {
    const { flatListData, user } = this.state
    const query = { page, sort }
    const results = await getUserPlaylists(user.id, query)
    newState.flatListData = [...flatListData, ...results[0]]
    newState.endOfResultsReached = newState.flatListData.length >= results[1]
    return newState
  }

  _queryData = async (filterKey: string | null, page: number = 1) => {
    const { queryFrom, querySort } = this.state
    let newState = {
      isLoading: false,
      isLoadingMore: false,
      queryPage: page
    } as State

    if (filterKey === _podcastsKey) {
      newState = await this._queryPodcasts(newState, page, querySort)
    } else if (filterKey === _clipsKey) {
      newState = await this._queryMediaRefs(newState, page, querySort)
    } else if (filterKey === _playlistsKey) {
      newState = await this._queryPlaylists(newState, page, querySort)
    } else if (rightItems.some((option) => option.value === filterKey)) {
      if (queryFrom === _podcastsKey) {
        newState = await this._queryPodcasts(newState, page, filterKey)
      } else if (queryFrom === _clipsKey) {
        newState = await this._queryMediaRefs(newState, page, filterKey)
      } else if (queryFrom === _playlistsKey) {
        newState = await this._queryPlaylists(newState, page, filterKey)
      }
    }

    return newState
  }
}

const _podcastsKey = 'podcasts'
const _clipsKey = 'clips'
const _playlistsKey = 'playlists'
const _alphabeticalKey = 'alphabetical'
const _mostRecentKey = 'most-recent'
const _topPastDay = 'top-past-day'
const _topPastWeek = 'top-past-week'
const _topPastMonth = 'top-past-month'
const _topPastYear = 'top-past-year'

const leftItems = [
  {
    label: 'Podcasts',
    value: _podcastsKey
  },
  {
    label: 'Clips',
    value: _clipsKey
  },
  {
    label: 'Playlists',
    value: _playlistsKey
  }
]

const rightItems = [
  {
    label: 'most recent',
    value: _mostRecentKey
  },
  {
    label: 'top - past day',
    value: _topPastDay
  },
  {
    label: 'top - past week',
    value: _topPastWeek
  },
  {
    label: 'top - past month',
    value: _topPastMonth
  },
  {
    label: 'top - past year',
    value: _topPastYear
  }
]

const rightItemsWithAlphabetical = [
  {
    label: 'alphabetical',
    value: _alphabeticalKey
  },
  {
    label: 'most recent',
    value: _mostRecentKey
  },
  {
    label: 'top - past day',
    value: _topPastDay
  },
  {
    label: 'top - past week',
    value: _topPastWeek
  },
  {
    label: 'top - past month',
    value: _topPastMonth
  },
  {
    label: 'top - past year',
    value: _topPastYear
  }
]

const styles = {
  view: {
    flex: 1
  }
}
