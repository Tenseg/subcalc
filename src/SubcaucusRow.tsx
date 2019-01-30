import * as React from 'react'
// see https://www.primefaces.org/primereact
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
// local to this app
import * as _u from './Utilities'
import { Subcaucus } from './Subcaucus'

export type SubcaucusRowAction = 'recalc' | 'enter' | 'remove'

interface Props {
	subcaucus: Subcaucus
	exchange: ((subcaucus: Subcaucus, action: SubcaucusRowAction) => void)
}

interface State {
	name: string
	count: number
	delegates: number
}

export class SubcaucusRow extends React.Component<Props, State> {

	constructor(props: Props) {
		super(props)
		this.state = {
			name: '',
			count: 0,
			delegates: 0,
		}
		this.state = {
			name: this.props.subcaucus.name,
			count: this.props.subcaucus.count,
			delegates: this.props.subcaucus.delegates
		}
	}

	// static getDerivedStateFromProps(nextProps: Props, prevState: State) {
	// 	const newState = {
	// 		name: nextProps.subcaucus.name,
	// 		count: nextProps.subcaucus.count,
	// 		delegates: nextProps.subcaucus.delegates
	// 	}
	// 	return newState
	// }

	handleName = () => (event: React.FormEvent<HTMLTextAreaElement>) => {
		var value = event.currentTarget.value
		this.props.subcaucus.name = value
		this.setState({ name: value })
	}

	handleCount = () => (event: React.FormEvent<HTMLInputElement>) => {
		var num = Number(event.currentTarget.value)
		if (num < 0) {
			num = 0
		}
		this.setState({ count: num })
	}

	handleCountBlur = () => (event: React.FormEvent<HTMLInputElement>) => {
		if (this.props.subcaucus.count != this.state.count) {
			this.props.subcaucus.count = this.state.count
			this.props.exchange(this.props.subcaucus, 'recalc')
		}
	}

	handleKey = () => (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		if (event.key === 'Enter' || event.key === 'Tab') {
			this.props.exchange(this.props.subcaucus, 'enter')
		}
	}

	focusOnWholeText = () => (event: React.FormEvent<HTMLInputElement>) => {
		// event properties must be copied to use async
		const target = event.currentTarget
		// do this async to try to make Safari behave
		setTimeout(() => target.setSelectionRange(0, 9999), 0)
	}

	idPlus = (suffix: string): string | undefined => {
		return `subcaucus-${this.props.subcaucus.id}-${suffix}`
	}

	render() {
		_u.debug("render row", this.props.subcaucus.id, this.state)

		const { name, count, delegates } = this.state

		return (
			<div id={this.idPlus("row")}
				className={`subcaucus-row ${delegates > 0 ? "has-delegates" : (count > 0 ? "no-delegates" : "")}`}
			>
				{_u.isDebugging ? <div className="subcaucus-id">{this.props.subcaucus.id}</div> : ''}
				<InputTextarea id={this.idPlus("row-name")}
					className="subcaucus-field subcaucus-name"
					autoComplete="off"
					type="text"
					value={name}
					rows={1}
					cols={1}
					// PrimeReact has a bug with the InputTextarea placeholder
					// for now, it will not update this placeholder
					// see: https://github.com/primefaces/primereact/issues/747
					placeholder={`Subcaucus ${this.props.subcaucus.id}`}
					// placeholder={`Subcaucus name`}
					onChange={this.handleName()}
					onKeyUp={this.handleKey()}
				/>
				<InputText id={this.idPlus("row-count")}
					className="subcaucus-field subcaucus-count"
					autoComplete="off"
					keyfilter="pint"
					type="text"
					pattern="\d*"
					value={count ? count : ''}
					placeholder={`—`}
					onChange={this.handleCount()}
					onBlur={this.handleCountBlur()}
					// forcing the selction of the whole text seems to lead to problems
					// see https://grand.clst.org:3000/tenseg/subcalc-pr/issues/3
					// onFocus={this.focusOnWholeText()}
					onKeyUp={this.handleKey()}
				/>
				<Button id={this.idPlus("row-delegates")}
					className={`subcaucus-delegates-button ${delegates > 0 ? "p-button-success" : "p-button-secondary"}`}
					label={delegates ? `${delegates}` : undefined}
					icon={delegates ? undefined : (count ? 'pi pi-ban' : 'pi')}
				/>
			</div>
		)
	}
}
