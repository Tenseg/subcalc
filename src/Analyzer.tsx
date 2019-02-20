/**
 * Analyzer.tsx
 *
 * A ReactJS component that presents an analysis of a snapshot.
 *
 * Copyright 2019 by Tenseg LLC
 * Made available under the MIT License
 */

import * as React from 'react'

// see https://github.com/ClickSimply/typescript-map
import { TSMap } from 'typescript-map'

// see https://www.primefaces.org/primereact
import { Button } from 'primereact/button'
import { Menubar } from 'primereact/menubar'
import { Chart } from 'primereact/chart';

// local to this app
import * as _u from './Utilities'
import { Snapshot } from './Snapshot'

/**
 * Facilitates sorting up or down (or not at all), as needed.
 */
enum SortOrder {
    Descending = -1,
    None = 0,
    Ascending = 1,
}

/**
 * Properties for the snapshot loader.
 */
interface Props {
    snapshot: Snapshot
    onExit: (() => void)
}

/**
 * State for the snapshot loader.
 */
interface State {
    counting: 'members' | 'delegates' | 'subcaucuses'
}

/**
 * A ReactJS component that presents the snapshot loader.
 */
export class Analyzer extends React.Component<Props, State> {

    constructor(props: Props) {
        super(props)
        this.state = {
            counting: "delegates",
        }
    }

    /**
     * Returns JSX for the menubar.
     * 
     * NOTE: Do not `setState()` in this method.
     */
    renderMenu = (): JSX.Element => {
        const items: any = []
        items.push({
            label: "Back to the calculator",
            icon: "fa fa-fw fa-chevron-left",
            command: () => this.props.onExit()
        })
        return <Menubar key="analyzer-menu" model={items} id="app-main-menu" />
    }

    /**
     * Returns JSX for the menubar.
     * 
     * NOTE: Do not `setState()` in this method.
     */
    renderAnalysis = (): Array<JSX.Element> => {
        const counting = this.state.counting
        const stopWords = ["for", "of", "the", "a", "s", "and", "that", "in", "it"]
        let words = new TSMap<string, { word: string, count: number }>()
        this.props.snapshot.subcaucuses.forEach((subcaucus) => {
            // snip the name into words
            const snips = subcaucus.displayName().match(/\b(\w+)\b/g)
            if (snips) {
                // filter the words into a distinct set of lowercase words
                const distinct = snips.map((v) => v.toLocaleLowerCase()).filter((value, index, self) => self.indexOf(value) === index)
                distinct.forEach((word) => {
                    if (stopWords.indexOf(word) !== -1) return
                    let record = words.get(word) || { word: word, count: 0 }
                    let count = subcaucus.count
                    if (counting === 'delegates') {
                        count = subcaucus.delegates
                    }
                    if (counting === 'subcaucuses') {
                        count = 1
                    }
                    record.count += count
                    words.set(word, record)
                })
            }
        })
        words.set("END", { word: "END", count: 0 }) // added just in case there is no empty subcaucus

        let combinedWords = new TSMap<string, number>()
        let currentCount = 0
        let currentWords: Array<string> = []
        words.values().sort((a, b) => {
            return b.count - a.count
        }).forEach((record) => {
            // note that the records with count of zero will never be pushed
            // because they will never differ from the currentCount
            // that is why we include the "END" record above
            if (currentCount !== record.count) {
                const joinedWords = currentWords.join(" ")
                if (currentCount > 0) {
                    combinedWords.set(joinedWords, currentCount)
                }
                currentCount = record.count
                currentWords = [record.word]
            } else {
                currentWords.push(record.word)
            }
        })

        let backgroundColor = 'rgba(54, 162, 235, 0.2)'
        let borderColor = 'rgb(54, 162, 235)'

        if (counting === 'delegates') {
            backgroundColor = 'rgba(75, 192, 192, 0.2)'
            borderColor = 'rgb(75, 192, 192)'
        }

        if (counting === 'subcaucuses') {
            backgroundColor = 'rgba(255, 159, 64, 0.2)'
            borderColor = 'rgb(255, 159, 64)'
        }

        const data = {
            labels: combinedWords.keys(),
            datasets: [{
                label: counting,
                backgroundColor: backgroundColor,
                borderColor: borderColor,
                borderWidth: 1,
                data: combinedWords.values()
            }]
        }

        _u.debug("data for chart", data)

        const fontFamily = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen-Sans,Ubuntu,Cantarell,'Helvetica Neue',sans-serif"

        return ([<Chart key="chart" type="horizontalBar" data={data} options={{
            fontFamily: "serif",
            legend: {
                display: false,
                labels: {
                    fontFamily: fontFamily,
                },
            },
            scales: {
                yAxes: [{
                    ticks: {
                        fontFamily: fontFamily,
                        autoSkip: false,
                    },
                    gridLines: {
                        display: false,
                    },
                }],
                xAxes: [{
                    ticks: {
                        fontFamily: fontFamily,
                        min: 0,
                    },
                }]
            },
            tooltips: {
                titleFontFamily: fontFamily,
                bodyFontFamily: fontFamily,
                footerFontFamily: fontFamily,
            },
        }} />])

    }

    switch = (value: "members" | "delegates" | "subcaucuses") => (event: React.MouseEvent<HTMLButtonElement>) => {
        event.currentTarget.blur()
        this.setState({ counting: value })
    }

    /**
     * Render JSX for this component.
     */
    render() {
        const { name, revision } = this.props.snapshot

        return (
            <div className="analyzer">
                {this.renderMenu()}
                <div id="meeting-info">
                    <div id="meeting-name" className="not-button">
                        {name ? name : this.props.snapshot.defaultName()}
                        {revision != ''
                            ? <span className="snapshot">
                                {revision}
                            </span>
                            : ''
                        }
                    </div>
                </div>
                <div id="analyzer-container">
                    <div id="analyzer-chart">
                        {this.renderAnalysis()}
                    </div>
                    <div id="analyzer-buttons">
                        <Button id="counting-delegates-button"
                            label="Delegates"
                            className={"counting-delegates"}
                            disabled={this.state.counting === "delegates"}
                            onClick={this.switch("delegates")}
                        />
                        <Button id="counting-members-button"
                            label="Members"
                            className={"counting-members"}
                            disabled={this.state.counting === "members"}
                            onClick={this.switch("members")}
                        />
                        <Button id="counting-subcaucuses-button"
                            label="Subcaucuses"
                            className={"counting-subcaucuses"}
                            disabled={this.state.counting === "subcaucuses"}
                            onClick={this.switch("subcaucuses")}
                        />
                    </div>
                </div>
            </div>
        )
    }
}
