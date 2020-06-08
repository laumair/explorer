import classNames from "classnames";
import React, { ReactNode } from "react";
import { RouteComponentProps } from "react-router-dom";
import copyGray from "../../assets/copy-gray.svg";
import { ServiceFactory } from "../../factories/serviceFactory";
import { ClipboardHelper } from "../../helpers/clipboardHelper";
import { TrytesHelper } from "../../helpers/trytesHelper";
import { TangleCacheService } from "../../services/tangleCacheService";
import AsyncComponent from "../components/AsyncComponent";
import MessageButton from "../components/MessageButton";
import Spinner from "../components/Spinner";
import "./Mam.scss";
import { MamRouteProps } from "./MamRouteProps";
import { MamState } from "./MamState";

/**
 * Component which will show the mam page.
 */
class Mam extends AsyncComponent<RouteComponentProps<MamRouteProps>, MamState> {
    /**
     * API Client for tangle requests.
     */
    private readonly _tangleCacheService: TangleCacheService;

    /**
     * Update timer.
     */
    private _updateTimer?: NodeJS.Timer;

    /**
     * Next Root to retrieve from.
     */
    private _nextRoot?: string;

    /**
     * Packet timout.
     */
    private _timeout: number;

    /**
     * Create a new instance of Mam.
     * @param props The props.
     */
    constructor(props: RouteComponentProps<MamRouteProps>) {
        super(props);

        this._tangleCacheService = ServiceFactory.get<TangleCacheService>("tangle-cache");
        this._timeout = 100;

        this.state = {
            statusBusy: false,
            status: "",
            root: props.match.params.hash || "",
            rootValidation: "",
            mode: props.match.params.mode || "public",
            sideKey: props.match.params.key || "",
            sideKeyValidation: "",
            isValid: false,
            packets: []
        };
    }

    /**
     * The component mounted.
     */
    public async componentDidMount(): Promise<void> {
        super.componentDidMount();

        if (this.state.root.length > 0) {
            this.findData();
        }
    }

    /**
     * The component will unmount from the dom.
     */
    public async componentWillUnmount(): Promise<void> {
        this.stopData();
    }

    /**
     * Render the component.
     * @returns The node to render.
     */
    public render(): ReactNode {
        return (
            <div className="mam">
                <div className="wrapper">
                    <div className="inner">
                        <h1>MAM Channel</h1>
                        <div className="row top">
                            <div className="cards">
                                <div className="card">
                                    <div className="card--header card--header__space-between">
                                        <h2>General</h2>
                                    </div>
                                    <div className="card--content">
                                        <div className="row middle margin-b-s">
                                            <div className="card--label form-label-width">
                                                Root
                                            </div>
                                            <input
                                                type="text"
                                                value={this.state.root}
                                                onChange={e => this.setState(
                                                    { root: e.target.value.toUpperCase() }, () => this.validate())
                                                }
                                                disabled={this.state.statusBusy}
                                                className="form-input-long"
                                                maxLength={81}
                                            />
                                        </div>
                                        {this.state.rootValidation && (
                                            <div className="row danger form-validation">
                                                <div className="card--label form-label-width">&nbsp;</div>
                                                {this.state.rootValidation}
                                            </div>
                                        )}
                                        <div className="row margin-b-s">
                                            <div className="card--label form-label-width">
                                                Mode
                                            </div>
                                            <button
                                                className={classNames(
                                                    "form-button",
                                                    "margin-r-t",
                                                    { selected: this.state.mode === "public" }
                                                )}
                                                onClick={() => this.setState(
                                                    { mode: "public", sideKey: "" }, () => this.validate()
                                                )}
                                                disabled={this.state.statusBusy}
                                            >
                                                Public
                                            </button>
                                            <button
                                                className={classNames(
                                                    "form-button",
                                                    "margin-r-t",
                                                    { selected: this.state.mode === "private" }
                                                )}
                                                onClick={() => this.setState(
                                                    { mode: "private", sideKey: "" }, () => this.validate()
                                                )}
                                                disabled={this.state.statusBusy}
                                            >
                                                Private
                                            </button>
                                            <button
                                                className={classNames(
                                                    "form-button",
                                                    { selected: this.state.mode === "restricted" }
                                                )}
                                                onClick={() => this.setState(
                                                    { mode: "restricted" }, () => this.validate()
                                                )}
                                                disabled={this.state.statusBusy}
                                            >
                                                Restricted
                                            </button>
                                        </div>
                                        <div className="row margin-b-s">
                                            <div className="card--label form-label-width">
                                                Side Key
                                            </div>
                                            <input
                                                type="text"
                                                value={this.state.sideKey}
                                                onChange={e => this.setState(
                                                    { sideKey: e.target.value.toUpperCase() }, () => this.validate())
                                                }
                                                disabled={this.state.mode !== "restricted" || this.state.statusBusy}
                                                className="form-input-long"
                                                maxLength={81}
                                            />
                                        </div>
                                        <div className="row margin-b-s">
                                            <div className="card--label form-label-width">
                                                &nbsp;
                                            </div>
                                            <button
                                                className="form-button selected margin-r-t"
                                                onClick={() => this.findData()}
                                                disabled={this.state.statusBusy || !this.state.isValid}
                                            >
                                                Find Data
                                            </button>
                                            <button
                                                className="form-button selected margin-r-t"
                                                onClick={() => this.stopData()}
                                                disabled={!this.state.statusBusy}
                                            >
                                                Stop
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                {this.state.packets && this.state.packets.map((item, idx) => (
                                    <div className="card margin-t-s" key={item.root}>
                                        <div className="card--content">
                                            <div className="item-details">
                                                <div className="card--label">
                                                    Root
                                                </div>
                                                <div className="card--value">
                                                    {item.root}
                                                </div>
                                                <div className="card--label">
                                                    Tag
                                                </div>
                                                <div className="card--value">
                                                    {item.tag}
                                                </div>
                                                <div className="card--label row middle margin-b-2">
                                                    <span className="margin-r-s">
                                                        {item.messageType !== "Trytes" && (
                                                            <button
                                                                onClick={() => {
                                                                    const oldPackets = this.state.packets.slice();
                                                                    oldPackets[idx].showRawMessageTrytes =
                                                                        !oldPackets[idx].showRawMessageTrytes;
                                                                    this.setState({
                                                                        packets: oldPackets
                                                                    });
                                                                }}
                                                            >
                                                                Message {item.showRawMessageTrytes ?
                                                                    "Trytes" : item.messageType}
                                                            </button>
                                                        )}
                                                        {item.messageType === "Trytes" && (
                                                            `Message ${item.messageType}`
                                                        )}
                                                    </span>
                                                    <MessageButton
                                                        message="Copied"
                                                        onClick={() => ClipboardHelper.copy(
                                                            item.showRawMessageTrytes
                                                                ? item.rawMessageTrytes
                                                                : item.message)}
                                                    >
                                                        <img src={copyGray} alt="Copy" />
                                                    </MessageButton>
                                                </div>
                                                <div
                                                    className={
                                                        classNames(
                                                            "card--value",
                                                            "card--value-textarea",
                                                            `card--value-textarea__${
                                                            item.showRawMessageTrytes
                                                                ? "trytes"
                                                                : item.messageType?.toLowerCase()}`
                                                        )}
                                                >
                                                    {item.showRawMessageTrytes
                                                        ? item.rawMessageTrytes
                                                        : item.message}
                                                </div>
                                                {this.state.packets.length - 1 === idx && (
                                                    <React.Fragment>
                                                        <div className="card--label">
                                                            Next Root
                                                        </div>
                                                        <div className="card--value">
                                                            {item.nextRoot}
                                                        </div>
                                                    </React.Fragment>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {this.state.status && (
                                    <div className="card margin-t-s">
                                        <div className="card--content middle row">
                                            {this.state.statusBusy && (<Spinner />)}
                                            <p className="status">
                                                {this.state.status}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div >
        );
    }

    /**
     * Decode the trytes into its fields.
     * @returns True if valid.
     */
    private validate(): boolean {
        let rootValidation = "";
        let sideKeyValidation = "";

        const root = this.state.root.toUpperCase();
        if (root.length > 0) {
            if (root.length !== 81) {
                rootValidation = `The root must be 81 in length, it is ${root.length}.`;
            }

            if (!/^[9A-Z]*$/.test(root)) {
                rootValidation = "Trytes must be characters A-Z or 9.";
            }
        }

        if (this.state.mode === "restricted") {
            if (this.state.sideKey.trim().length === 0) {
                sideKeyValidation = "You must specify a key for restricted mode.";
            }
        }

        this.setState({
            rootValidation,
            sideKeyValidation,
            isValid: rootValidation.length === 0 && sideKeyValidation.length === 0
        });

        return rootValidation.length === 0 && sideKeyValidation.length === 0;
    }

    /**
     * Find the data from the MAM channel.
     */
    private findData(): void {
        const isValid = this.validate();

        if (isValid) {
            this.setState(
                {
                    statusBusy: true,
                    status: "Finding MAM channel data...",
                    packets: []
                },
                async () => {
                    this._nextRoot = this.state.root;
                    this._timeout = 100;
                    await this.loadNextPacket(true);
                });
        }
    }

    /**
     * Stop loading the data.
     */
    private stopData(): void {
        if (this._updateTimer) {
            clearTimeout(this._updateTimer);
            this._updateTimer = undefined;
        }
        this.setState({ statusBusy: false, status: "" });
    }

    /**
     * Load the next packet from the mam channel.
     * @param force Force the read to start.
     */
    private async loadNextPacket(force?: boolean): Promise<void> {
        if (this._nextRoot && (this._updateTimer || force) && this.state.statusBusy) {
            const packet = await this._tangleCacheService.getMamPacket(
                this._nextRoot, this.state.mode, this.state.sideKey, this.props.match.params.network);

            if (packet) {
                const packets = this.state.packets;
                const decoded = TrytesHelper.decodeMessage(packet.payload);

                packets.push({
                    root: this._nextRoot,
                    nextRoot: packet.nextRoot,
                    tag: packet.tag,
                    message: decoded.message,
                    messageType: decoded.messageType,
                    rawMessageTrytes: packet.payload,
                    showRawMessageTrytes: false
                });

                this.setState({ packets });

                this._nextRoot = packet.nextRoot;
                this._timeout = 100;
            } else {
                if (this._timeout < 10000) {
                    this._timeout += 500;
                }
            }
            if (this._updateTimer) {
                clearTimeout(this._updateTimer);
            }
            this._updateTimer = setTimeout(async () => this.loadNextPacket(), this._timeout);
        }
    }
}

export default Mam;