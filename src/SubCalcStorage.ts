/**
 * SubCalcStorage.ts
 * 
 * Manages storage in app or localStorage.
 * Handles conversion to and from JSON.
 */

// see https://github.com/ClickSimply/typescript-map
import { TSMap } from 'typescript-map'
// local to this app
import * as _u from './Utilities'
import { Subcaucus } from './Subcaucus'

declare global {

	/**
	 * Elements of a snapshot of a meeting in time.
	 */
	interface MeetingSnapshot {
		created: TimestampString
		author: number
		revised: TimestampString
		revision: string
		name: string
		allowed: number
		seed: number
		currentSubcaucusID: number
		subcaucuses: TSMap<number, Subcaucus>
	}

	/**
	 * Elements of the whole meeting.
	 */
	interface Meeting {
		key: string
		created: TimestampString
		author: number
		current: MeetingSnapshot
		snapshots: TSMap<string, MeetingSnapshot>
	}

}

/**
 * Manages storage in app or localStorage.
 * Handles conversion to and from JSON.
 */
export class SubCalcStorage {

	/**
	 * Version helps to future-proof the stored JSON.
	 */
	version = 2

	/**
	 * This author is just a random number that will help
	 * distinguish meeting identifiers if they start to be
	 * shared among devices. Hopefully a combination of 
	 * author and meeting creation date won't collide.
	 */
	author = 0

	/**
	 * Used to find the current meeting.
	 */
	currentMeetingKey = ''

	/**
	 * A map of meeting keys to meeting records.
	 */
	meetings = new TSMap<string, Meeting>()

	/**
	 * A prefix to be used when creating local storage items
	 * for each meeting.
	 */
	meetingPrefix = "sc-meeting"

	/**
	 * Create an instance of a storage object to manage local storage.
	 */
	constructor() {

		// then we look for local data

		this.importSubCalc2Data()

		if (!this.author) {

			this.importSubCalc1Data()

			if (!this.author) {

				// no author means that subcalc has never run in this browser
				// so we gather together some basics about this instance

				this.author = _u.randomSeed()

				// since there was no data at all, we also don't have a
				// current meeting, so we have to create that and write
				// it out as well

				this.newMeeting()
			}
		}


		// then we look for URI data
		// this would become current if we find it

	}

	/**
	 * Returns a string to be used as a key for looking up a meeting.
	 */
	meetingKey = (created: TimestampString, author?: number): string => {
		// we include the author number in the key in case meetings are shared
		author = author || this.author
		return `${created} ${author}`
	}

	/**
	 * Creates a new meeting and returns the current snapshot
	 * from that new meeting.
	 */
	newMeeting = (): MeetingSnapshot => {
		const created = (new Date()).toTimestampString()
		this.currentMeetingKey = this.meetingKey(created)

		const currentSnapshot = this.emptyMeetingSnapshot(created)

		this.meetings.set(this.currentMeetingKey, {
			key: this.currentMeetingKey,
			author: this.author,
			created: created,
			current: currentSnapshot,
			snapshots: new TSMap<string, MeetingSnapshot>()
		})

		this.writeMeetingSnapshot(currentSnapshot)

		return currentSnapshot
	}

	/**
	 * Create a new and empty snapshot of a meeting.
	 */
	emptyMeetingSnapshot = (created?: TimestampString): MeetingSnapshot => {
		if (created === undefined) {
			created = (new Date()).toTimestampString()
		}

		// create a subcaucus ID and three subcaucuses
		let currentSubcaucusID = 1
		let subcaucuses = new TSMap<number, Subcaucus>()
		subcaucuses.set(currentSubcaucusID, new Subcaucus(currentSubcaucusID++))
		subcaucuses.set(currentSubcaucusID, new Subcaucus(currentSubcaucusID++))
		subcaucuses.set(currentSubcaucusID, new Subcaucus(currentSubcaucusID++))

		return {
			created: created,
			author: this.author,
			revised: '',
			revision: '',
			name: '',
			allowed: 0,
			seed: _u.randomSeed(),
			currentSubcaucusID: currentSubcaucusID,
			subcaucuses: subcaucuses
		}
	}

	/**
	 * Writes the a meeting snapshot to local storage.
	 */
	writeMeetingSnapshot(snapshot: MeetingSnapshot) {
		const meetingKey = this.meetingKey(snapshot.created)
		const isCurrent = (snapshot.revision == '')
		const meeting = this.meetings.get(meetingKey)
		const copyOfSnapshot = this.copySnapshot(snapshot)

		if (meeting) {
			// add the snapshot to our instance data
			if (isCurrent) {
				this.meetings.get(meetingKey).current = copyOfSnapshot
			} else {
				this.meetings.get(meetingKey).snapshots.set(snapshot.revised, copyOfSnapshot)
			}

			// synchronize our instance data with local storage
			this.writeMeeting(meeting)
		} else {
			_u.alertUser(new Error(`Meeting not found for ${meetingKey}`))
		}
	}

	/**
	 * Writes a meeting to local storage.
	 */
	writeMeeting = (meeting: Meeting) => {
		const jsonSubCalc = {
			v: this.version,
			author: this.author,
			current: meeting.key
		}

		try {
			const jsonSubCalcString = JSON.stringify(jsonSubCalc)
			_u.debug("storing subcalc2", jsonSubCalcString)
			localStorage.setItem("subcalc2", jsonSubCalcString)
		} catch (e) {
			_u.alertUser(new Error("Failed to save subcalc2 to local storage"), e)
			return
		}

		const jsonMeeting = {
			v: this.version,
			created: meeting.created,
			author: meeting.author,
			current: this.meetingSnapshotToJSON(meeting.current),
			snapshots: meeting.snapshots.map((snapshot) => {
				return this.meetingSnapshotToJSON(snapshot)
			})
		}

		const localStorageKey = `${this.meetingPrefix} ${meeting.key}`
		try {
			const jsonMeetingString = JSON.stringify(jsonMeeting)
			_u.debug(`storing ${localStorageKey}`, jsonMeetingString)
			localStorage.setItem(`${localStorageKey}`, jsonMeetingString)
		} catch (e) {
			_u.alertUser(new Error(`Error saving ${localStorageKey} to local storage`), e)
			return
		}
	}

	/**
	 * Create a JSON object from a meeting snapshot.
	 * 
	 * NOTE: This object is _not_ stringified yet.
	 */
	meetingSnapshotToJSON = (snapshot: MeetingSnapshot): Object => {
		return { ...snapshot, created: undefined, currentSubcaucusID: undefined }
	}

	importSubCalc1Data = () => {

	}

	/**
	 * Try to populate this instance with subcalc2 data from local storage.
	 */
	importSubCalc2Data = () => {
		const subcalc = JSON.parse(localStorage.getItem("subcalc2") || 'false')

		if (!subcalc) return // we just don't have any subcalc2 data yet

		this.author = Number(subcalc["author"]) || 0

		if (!this.author) {
			_u.debug(new Error("No author in subcalc2"), subcalc)
			return // the subcalc2 data we have is malformed and will be overwritten
		}

		this.currentMeetingKey = String(subcalc["current"]) || ''

		const length = localStorage.length

		this.meetings = new TSMap<string, Meeting>()

		for (let i = 0; i < length; i++) {
			const key = localStorage.key(i)
			if (!key) break
			if (key.startsWith(this.meetingPrefix)) {
				const meeting = this.getMeetingFromLocalStorage(key)
				if (meeting) {
					this.meetings.set(meeting.key, meeting)
				}
			}
		}
	}

	/**
	 * Given a meeting key, this functions looks for that meeting in
	 * local storage and creates a meeting object to hold the information.
	 */
	getMeetingFromLocalStorage = (key?: string): Meeting | undefined => {
		let jsonMeeting: Object

		key = key || `${this.meetingPrefix} ${this.currentMeetingKey}`

		try {
			jsonMeeting = JSON.parse(localStorage.getItem(key) || 'false')
		} catch (e) {
			_u.debug(e)
			return undefined
		}

		if (!jsonMeeting) {
			_u.debug(new Error(`Could not retreive ${key}`))
			return undefined
		}

		const author = Number(jsonMeeting["author"])
		const created = String(jsonMeeting["created"])

		if (!author || !created) {
			_u.debug(new Error(`Missing author or created in ${key}`), jsonMeeting)
			return undefined
		}

		const currentMeeting = this.jsonToMeetingSnapshot(jsonMeeting["current"], created, author)

		if (!currentMeeting) {
			_u.debug(new Error(`Could not find current snapshot in ${key}`), jsonMeeting)
			return undefined
		}

		if (!Array.isArray(jsonMeeting["snapshots"])) {
			_u.debug(new Error(`No "snapshots" array in ${key}`), jsonMeeting)
			return undefined
		}

		let snapshots = new TSMap<string, MeetingSnapshot>()

		jsonMeeting["snapshots"].forEach((jsonSnapshot: any) => {
			const snapshot = this.jsonToMeetingSnapshot(jsonSnapshot, created, author)
			if (snapshot) {
				snapshots.set(snapshot.revised, snapshot)
			}
		})

		return {
			key: this.meetingKey(created, author),
			author: author,
			created: created,
			current: currentMeeting,
			snapshots: snapshots
		}
	}

	/**
	 * Given the JSON object version of snapshot data and the meeting's
	 * created timestamp, this function populates a meeting snapshot object.
	 */
	jsonToMeetingSnapshot = (jsonSnapshot: any, created: TimestampString, author: number): MeetingSnapshot | undefined => {

		const revised = String(jsonSnapshot['revised'] || '')
		const revision = String(jsonSnapshot['revision'] || '')
		const name = String(jsonSnapshot['name'] || '')
		const allowed = Number(jsonSnapshot['allowed'] || 0)
		const seed = Number(jsonSnapshot['seed'])

		if (!seed) {
			_u.debug(new Error("Seed missing in snapshot"), jsonSnapshot)
			return undefined
		}

		const jsonSubcaucuses = jsonSnapshot['subcaucuses']

		if (typeof jsonSubcaucuses != "object") {
			_u.debug(new Error("Non-object subcaucuses"), jsonSnapshot)
			return undefined
		}

		let currentSubcaucusID = 0
		let subcaucuses = new TSMap<number, Subcaucus>()

		Object.keys(jsonSubcaucuses).forEach((key: any) => {
			key = Number(key)
			const subcaucus = this.jsonToSubcaucus(jsonSubcaucuses[key], key)
			if (subcaucus) {
				currentSubcaucusID = Math.max(currentSubcaucusID, key)
				subcaucuses.set(key, subcaucus)
			}
		})

		currentSubcaucusID++ // represents the next ID we should hand out
		_u.debug("currentSubcaucusID", currentSubcaucusID)

		return {
			created: created,
			author: author,
			revised: revised,
			revision: revision,
			name: name,
			allowed: allowed,
			seed: seed,
			currentSubcaucusID: currentSubcaucusID,
			subcaucuses: subcaucuses
		}
	}

	/**
	 * Given the JSON object version of a subcacucus and its key, this function
	 * creates the subcaucus object version.
	 */
	jsonToSubcaucus = (jsonSubcaucus: any, key: number): Subcaucus | undefined => {

		if (typeof jsonSubcaucus != "object") {
			_u.debug(new Error(`Non-object subcaucus ${key}`), jsonSubcaucus)
			return undefined
		}

		return new Subcaucus(key, {
			name: jsonSubcaucus["name"],
			count: jsonSubcaucus["count"]
		})
	}

	/**
	 * Make a copy of the snapshot that has no lingering references to the original.
	 */
	copySnapshot = (snapshot: MeetingSnapshot): MeetingSnapshot => {
		let newSnapshot = {
			...snapshot,
			subcacucuses: new TSMap<number, Subcaucus>().fromJSON(snapshot.subcaucuses.toJSON())
		}
		return newSnapshot
	}

	/**
	 * Retrieve a snapshot (by default, the current meeting's current state),
	 * from storage.
	 * 
	 * NOTE: A side effect of this function is that the `currentMeetingKey`
	 * of the Storage instance is reset when retrieval is successful.
	 */
	getSnapshot = (meetingKey = '', timestamp?: string): MeetingSnapshot | undefined => {
		const { currentMeetingKey, meetings } = this

		if (meetingKey === '') {
			if (!currentMeetingKey) {
				_u.alertUser(new Error("No current meeting data"))
				return undefined
			}
			meetingKey = currentMeetingKey
		}

		const meeting = meetings.get(meetingKey)

		if (meeting === undefined) {
			_u.alertUser(new Error(`No data for meeting ${meetingKey}`))
			return undefined
		}

		if (timestamp === undefined) {
			this.currentMeetingKey = meetingKey
			return this.copySnapshot(meeting.current)
		}

		const snapshot = meeting.snapshots[timestamp]

		if (snapshot === undefined) {
			_u.alertUser(new Error(`No data for meeting ${currentMeetingKey} snapshot ${timestamp}`))
			return undefined
		}

		this.currentMeetingKey = meetingKey
		return this.copySnapshot(snapshot)
	}


}