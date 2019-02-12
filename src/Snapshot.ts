/**
 * Snapshot.ts
 * 
 * Holds all the information for a single snapshot.
 * Handles the calculation of delegates for a snapshot.
 * Handles conversion to and from JSON.
 */

// see https://github.com/ClickSimply/typescript-map
import { TSMap } from 'typescript-map'

// see: https://github.com/mojotech/json-type-validation
import { Decoder, object, string, number, dict } from '@mojotech/json-type-validation'

// local to this app
import * as _u from './Utilities'
import { Subcaucus } from './Subcaucus'
import { SubCalcPRNG } from './SubCalcPRNG'

declare global {

	interface SnapshotInitializer {
		device: number
		created: TimestampString
		with?: {
			revised?: TimestampString
			revision?: string
			name?: string
			allowed?: number
			seed?: number
			subcaucuses?: TSMap<number, Subcaucus>
		},
		json?: SnapshotJSON
	}

	interface SnapshotJSON {
		device: number
		created: TimestampString
		revised: TimestampString
		revision: string
		name: string
		allowed: number
		seed: number
		subcaucuses: { [id: string]: SubcaucusJSON }
	}

}

export class Snapshot {

	debugID = ` ------ ${_u.uniqueNumber()} ------ `
	debug = (): string => {
		return "\nSnapshot" + this.debugID + "\n"
			+ this.name + "/" + this.revision + "/" + this.allowed
			+ " " + this.subcaucuses.map((s) => s.debug()).join(", ")
	}
	created: TimestampString
	device: number
	revised: TimestampString
	revision: string
	name: string
	allowed: number
	seed: number
	subcaucuses: TSMap<number, Subcaucus>

	static decoder: Decoder<SnapshotJSON> = object({
		device: number(),
		created: string(),
		revised: string(),
		revision: string(),
		name: string(),
		allowed: number(),
		seed: number(),
		subcaucuses: dict(Subcaucus.decoder)
	})

	/**
	 * Creates a new snapshot instance.
	 * 
```typescript
interface SnapshotInitializer {
	device: number
	created: TimestampString
	with?: {
		revised?: TimestampString
		revision?: string
		name?: string
		allowed?: number
		seed?: number
		subcaucuses?: TSMap<number, Subcaucus>
	}
	json?: SnapshotJSON
}
```
	 * 
	 * @param {SnapshotInitializer} init
	 */
	constructor(init: SnapshotInitializer) {
		this.created = init.created
		this.device = init.device
		this.revised = _u.now()
		this.revision = ''
		this.name = ''
		this.allowed = 0
		this.seed = _u.randomSeed()
		this.subcaucuses = new TSMap<number, Subcaucus>()

		if (init.with) {
			this.revised = init.with["revised"] || this.revised
			this.revision = init.with["revision"] || this.revision
			this.name = init.with["name"] || this.name
			this.allowed = init.with["allowed"] || this.allowed
			this.seed = init.with["seed"] || this.seed
			if (init.with["subcaucuses"]) {
				this.subcaucuses = init.with["subcaucuses"]
			}
		}

		if (init.json) {
			this.fromJSON(init.json)
		}

	}

	/**
	 * Provide a copy of this instance of a snapshot,
	 * including deep copies of the subcaucuses.
	 * 
	 * See: https://www.nickang.com/how-to-clone-class-instance-javascript/
	 */
	recreate = (): Snapshot => {
		// TSMap clones break classes and don't go deep enough
		// so we loop through and recreate subcaucuses
		let subcaucuses = new TSMap<number, Subcaucus>()
		this.subcaucuses.forEach((subcaucus) => {
			subcaucuses.set(subcaucus.id, subcaucus.recreate())
		})
		return new Snapshot({
			device: this.device,
			created: this.created,
			with: {
				revised: this.revised,
				revision: this.revision,
				name: this.name,
				allowed: this.allowed,
				seed: this.seed,
				subcaucuses: subcaucuses
			}
		})
	}

	/**
	 * Return a JSON object version of the data in this
	 * class wants to share.
	 */
	toJSON = (): {
		created: TimestampString
		device: number
		revised: TimestampString
		revision: string
		name: string
		allowed: number
		seed: number
		subcaucuses: any
	} => {
		return {
			created: this.created,
			device: this.device,
			revised: this.revised,
			revision: this.revision,
			name: this.name,
			allowed: this.allowed,
			seed: this.seed,
			subcaucuses: this.subcaucuses.toJSON(),
		}
	}

	fromJSON = (json: SnapshotJSON) => {
		const decoded = Snapshot.decoder.run(json)

		if (decoded.ok) {
			this.created = decoded.result.created
			this.device = decoded.result.device
			this.revised = decoded.result.revised
			this.revision = decoded.result.revision
			this.name = decoded.result.name
			this.allowed = decoded.result.allowed
			this.seed = decoded.result.seed
			this.subcaucuses = new TSMap<number, Subcaucus>()
			Object.keys(decoded.result.subcaucuses).forEach((key) => {
				const jsub = decoded.result.subcaucuses[key]
				const keyNum = Number(key)
				this.subcaucuses.set(keyNum, new Subcaucus({
					id: keyNum,
					json: jsub
				}))
			})
		} else {
			_u.debug(decoded.error)
		}
	}

	/**
	 * Update the snapshot with new values. 
	 * If signalling a change to subcaucuses
	 * just send without any update.
	 * 
	 * Revising the snapshot forces a 
	 * redistribution of delegates.
	 */
	revise = (update?: {
		name?: string,
		allowed?: number,
		seed?: number,
	}) => {
		// we mark the snapshot as revised even if no updates were sent
		// because it may be a signal that the subcaucuses changed
		this.revised = _u.now()
		this.revision = ""
		if (update) {
			if (update.name) {
				this.name = update.name
			}
			if (update.allowed) {
				this.allowed = update.allowed
			}
			if (update.seed) {
				this.seed = update.seed
			}
		}
		this.redistributeDelegates()
	}

	clearCounts = () => {
		this.revised = _u.now()
		this.revision = ""
		this.subcaucuses.forEach((sub) => {
			sub.count = 0
		})
		this.redistributeDelegates()
	}

	/**
	 * The number of people "in the room"
	 * (the total of subcaucus counts).
	 */
	participants = 0

	/**
	 * The total number of delegates allocated.
	 */
	totalDelegates = 0

	/**
	 * The number of people in the room divided by the number of delegates allowed.
	 */
	participantsPerDelegate = 0

	/**
	 * The number of members a subcaucus must have to be viable.
	 */
	viabilityNumber = 0

	/**
	 * The number of people who are members of viable subcaucuses
	 */
	viableParticipants = 0

	/**
	 * The total number of people who are members of viable subcaucuses
	 * divided by the number of delegates allowed.
	 */
	delegateDivisor = 0

	/**
	 * Recalculate the delegate numbers for this snapshot.
	 */
	redistributeDelegates = () => {
		_u.debug("Distributing delegates");

		if (!this.allowed) return

		const subs = this.subcaucuses.values()

		let scIncludeRemainderStatement = false; // will be set true if there is a coin flip

		// first clear out all the delegate information
		subs.forEach((s) => s.clearDelegateInfo())

		// "Step No. 1: Add up the total number of members of all the subcaucuses." (participants)
		this.participants = subs.reduce((acc, sub) => {
			return acc + sub.count
		}, 0)

		if (!this.participants) return

		// "Step No. 2: Divide the result of Step No. 1" (participants)
		// "by the total number of delegates to be elected," (allowed)
		// "round the result up to the next whole number." (viabilityNumber)
		// "This is the viability number." 
		// (this contradicts the example, which uses viability rather than wholeViability)

		this.participantsPerDelegate = this.participants / this.allowed
		this.viabilityNumber = Math.ceil(this.participantsPerDelegate)

		// determine which subcaucuses are viable (viabilityScore >= 1)
		// and calculate the total number viable people in the room (viableParticipants)

		const vSubs = subs.filter((s) => s.count >= this.viabilityNumber)
		this.viableParticipants = vSubs.reduce((acc, sub) => {
			return acc + sub.count
		}, 0)

		if (!this.viableParticipants) return

		// recalculate the viability number for the delegate allocation process
		this.delegateDivisor = this.viableParticipants / this.allowed;

		// calculate how many delegates each viable subcaucus gets
		vSubs.forEach((s) => s.setViability(this.delegateDivisor))

		// and add up the number of delegates assigned
		this.totalDelegates = vSubs.reduce((acc, sub) => {
			return acc + sub.baseDelegates
		}, 0)

		// now sort and assign the remainders

		// seed a new random number generator so that we get consistent random results
		const scRand = new SubCalcPRNG(this.seed)

		let vSubRanks = vSubs.map((s) => s.id)

		// see: https://bost.ocks.org/mike/shuffle/
		// and: https://stackoverflow.com/a/2450976
		let m = vSubRanks.length

		// While there remain elements to shuffle…
		while (m) {
			// Pick a remaining element…
			const i = scRand.randomUpTo(m--)

			// And swap it with the current element.
			const temp = vSubRanks[m]
			vSubRanks[m] = vSubRanks[i]
			vSubRanks[i] = temp
		}

		// sort the subcaucuses into remainder order with highest remainders first
		vSubs.sort((a, b) => {
			if (a.remainder > b.remainder) {
				return -1;
			}
			else if (a.remainder < b.remainder) {
				return 1;
			}

			// at this point we have a tie of remainders, so we have to "flip a coin"

			/*	A note about "coin-flips" or "drawing lots"...
		
				Traditionally, when there are delegates remaining to be assigned and
				two subcaucuses are "tied" with the same size delegations, the chair
				of the caucus will use some method of assigning those remaining delegates
				at random. These methods include coin-flips or drawing lots.
		
				In this program we accomplish the same randomness, but we do so by first
				building this "rank order" for remainders to be assigned. It is as though
				we flipped the coins before we had a tie and just said that in the event of
				a tie we will assign delegates in this (predetermined but random) order.
		
				However, since it is possible for this order to shift each time the calculation
				is run, it could be that the exact same set of counts for subcaucuses could result
				in slightly different delegate assignments from time to time.
			 
				At this point in the code, we've determined that two delegation have
				the exact same amount of "remainder". The next line of code flips the
				coin to predetermine the order in which these two delegations will be
				assigned delegates.
			*/

			const coinFlip = vSubRanks.indexOf(a.id) < vSubRanks.indexOf(b.id) ? -1 : 1

			// report the coin flip to each subcaucus
			a.coinToss(coinFlip === -1, b)
			b.coinToss(coinFlip === 1, a)

			// return the coin flip as the result of this comparison
			return (coinFlip);
		})

		// walk though the now-ranked subcaucuses to assign any remainders
		// this would be much simpler, exept we want to keep track of who
		// will really need to know details about tosses.
		let remainder = -1
		let reportingTo: Array<Subcaucus> = []
		let justAddedRemainderDelegate = false
		vSubs.forEach((s) => {
			if (this.totalDelegates < this.allowed) {
				this.totalDelegates++
				s.addRemainderDelegate()
				justAddedRemainderDelegate = true
				if (remainder != s.remainder) {
					// this means that all of the previous
					// remainder were assigned remainder delegates
					// so we don't have to report coin tosses
					reportingTo = []
					remainder = s.remainder
				}
				reportingTo.push(s)
			} else {
				if (remainder == s.remainder) {
					reportingTo.push(s)
				} else {
					if (justAddedRemainderDelegate) {
						// since the last remainder that got
						// a remainder delegate was not the same
						// as this remainder, it means there was
						// no contest between equal remainders,
						// so we don't have to report coin tosses
						reportingTo = []
					}
					remainder = -1
				}
				justAddedRemainderDelegate = false
			}
		})
		// those subcaucuses left in the report remainder list
		// should eventually report their coin tosses
		reportingTo.forEach((s) => {
			s.reportTosses = true
		})

		console.log("random summary", scRand.recordSummary())

	}

	/**
	 * Derive the appropriate meeting key from
	 * the data in this snapshot.
	 */
	meetingKey = (): string => {
		return `${this.created} ${this.device}`
	}

	/**
	 * Derive the appropriate snapshot key from
	 * the data in this snapshot.
	 */
	snapshotKey = (): string => {
		return `${this.created} ${this.device} ${this.revised}`
	}

	/**
	 * The next ID in use for subcacuses in this snapshot.
	 * 
	 * One more than the current maximum ID.
	 */
	nextSubcaucusID = (): number => {
		if (this.subcaucuses.length === 0) {
			return 1
		}
		const max = Math.max(...this.subcaucuses.keys())
		return max + 1
	}

    /**
     * Add a subcaucus (empty by default).
     */
	addSubcaucus = (name = '', count = 0, delegates = 0) => {
		const newID = this.nextSubcaucusID()
		this.subcaucuses.set(newID, new Subcaucus({
			id: newID,
			with: {
				name: name,
				count: count,
				delegates: delegates
			}
		}))
	}

	/**
	 * Delete a subcaucus from this snapshot.
	 */
	deleteSubcaucus = (id: number) => {
		this.subcaucuses.delete(id)
	}

	/**
	 * A textual representation of the state of this snapshot.
	 */
	asText = (): string => {
		let text = ""

		text += `${this.name} ${this.revision ? `(${this.revision}) ` : ''}was allowed ${this.allowed.singularPlural("delegate", "delegates")}.\n\n`

		if (this.participants > 0) {

			this.subcaucuses.forEach((subcaucus) => {
				const sText = subcaucus.asText()
				text += sText ? `- ${sText}\n\n` : ''
			})

			text += `${this.participants.singularPlural("person was", "people were")} participating, the initial viability number was ${this.viabilityNumber} (${this.participantsPerDelegate.decimalPlaces(3)} participants per delegate).\n\n`

			if (this.participants > this.viableParticipants) {
				text += `${this.viableParticipants.singularPlural("member was", "members were")} in a viable subcaucuses. `
				text += `The delegate divisor (number of members needed to allocate each delegate) was ${this.delegateDivisor.decimalPlaces(3)}.\n\n`
				text += `${(this.participants - this.viableParticipants).singularPlural("person was", "people were")} in a non-viable caucus.\n\n`
			}

		} else {
			text += "Nobody was participating.\n\n"
		}


		let revised = new Date(Date.parse(this.revised))

		text += `The coin had a random seed of ${this.seed}.\n`
		text += `Last revised ${revised.toLocaleString('en-US', { timeZoneName: 'short' })} \n`
		return text
	}

	/**
	 * A CSV representation of the state of this snapshot.
	 */
	asCSV = (): string => {
		let csv: Array<string> = []

		csv.push("Subcaucus,Members,Delegates,Remainder,Coin Tosses,Remainder Delegates")

		this.subcaucuses.forEach((subcaucus) => {
			const row = subcaucus.asCSV()
			if (row) {
				csv.push(row)
			}
		})

		csv.push('"",""')

		csv.push(`Participants,${this.participants}`)
		csv.push(`Delegates elected,,${this.totalDelegates}`)
		csv.push(`Participants per delegate,${this.participantsPerDelegate}`)
		csv.push(`Viability number,${this.viabilityNumber}`)
		csv.push(`Members in viable subcaucuses,${this.viableParticipants}`)
		csv.push(`Members in non-viable subcaucuses,${this.participants - this.viableParticipants}`)
		csv.push(`Delegate divisor,${this.delegateDivisor}`)

		csv.push('"",""')

		csv.push(`Coin random seed,${this.seed}`)
		let revised = new Date(Date.parse(this.revised))

		csv.push(`Revised,${revised.toLocaleString('en-US', { timeZoneName: 'short' }).csvQuoted()}`)
		csv.push(`Revision,${this.revision.csvQuoted()}`)
		csv.push(`Meeting,${this.name.csvQuoted()}`)



		return csv.join("\r\n")
	}

	/**
	 * Return a URL that will render this snapshot.
	 * 
	 * TODO: replace host info with our magic URL.
	 */
	asURL = () => {
		return `https://scimport.tenseg.net` + "?snapshot=" + encodeURIComponent(JSON.stringify(this.toJSON()))
	}
}