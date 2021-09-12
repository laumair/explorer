import "./IdentityHistory.scss";
import "../../../scss/layout.scss";

import React, { Component, Fragment, ReactNode } from "react";

import { DiffMessage } from "../../../models/api/IIdentityDiffHistoryResponse";
import { DownloadHelper } from "../../../helpers/downloadHelper";
import { HiDownload } from "react-icons/hi";
import { IdentityHistoryProps } from "./IdentityHistoryProps";
import { IdentityHistoryState } from "./IdentityHisotyState";
import IdentityJsonDifference from "./IdentityJsonDifferece";
import IdentityMessageIdOverview from "./IdentityMsgIdOverview";
import { IdentityResolverProps } from "../../routes/IdentityResolverProps";
import { IdentityService } from "../../../services/identityService";
import IdentityTree from "./tree/IdentityTree";
import JsonViewer from "../JsonViewer";
import { RouteComponentProps } from "react-router-dom";
import { ServiceFactory } from "../../../factories/serviceFactory";
import Spinner from "../Spinner";

export default class IdentityHistory extends Component<
    RouteComponentProps<IdentityResolverProps>,
    IdentityHistoryState
> {
    constructor(props: RouteComponentProps<IdentityHistoryProps>) {
        super(props);

        this.state = {
            loadingHistory: false,
            historyLoaded: false,
            resolvedHistory: {},
            selectedMessageId: "",
            contentOfSelectedMessage: {},
            error: undefined,
            compareWith: []
        };
    }

    public async componentDidMount(): Promise<void> {
        if (this.isDebugView() && !this.state.historyLoaded) {
            await this.loadIntegrationHistory();
        }
    }

    public render(): ReactNode {
        return (
            <Fragment>
                {/* --------- Load History Button --------- */}
                {!this.state.historyLoaded && !this.state.loadingHistory && !this.state.error && (
                    <button
                        className="load-history"
                        onClick={async () => {
                            await this.loadIntegrationHistory();
                        }}
                        type="button"
                    >
                        Load History
                    </button>
                )}

                {/* --------- History Card --------- */}
                {(this.state.historyLoaded || this.state.loadingHistory || this.state.error) && (
                    <div className="card history-content">
                        <div className="card--header card--header">
                            <h2>History</h2>
                        </div>

                        {/* --------- Resolving History Spinner --------- */}
                        {this.state.loadingHistory && (
                            <div className="card--content row">
                                <h3 className="margin-r-s">Resolving History ...</h3>
                                <Spinner />
                            </div>
                        )}

                        {/* --------- Error Case --------- */}
                        {this.state.error && (
                            <div className="card--content">
                                <p className="margin-r-s history-error">Something went wrong!</p>
                                <p className="margin-r-s history-error">{this.state.error}</p>
                            </div>
                        )}

                        {/* --------- History Tree and JsonVeiwer --------- */}
                        {this.state.historyLoaded && !this.state.error && (
                            <div className="card--content row row--tablet-responsive">
                                <div className="history-tree margin-b-s">
                                    <IdentityTree
                                        network={this.props.match.params.network}
                                        history={this.state.resolvedHistory}
                                        onItemClick={(messageId, content) => {
                                            this.setState({
                                                contentOfSelectedMessage: content,
                                                selectedMessageId: messageId,
                                                compareWith: this.getPreviousMessages(messageId)
                                            });
                                        }}
                                    />
                                </div>
                                <IdentityJsonDifference
                                    messageId={this.state.selectedMessageId ?? ""}
                                    content={this.state.contentOfSelectedMessage}
                                    compareWith={this.state.compareWith}
                                />
                            </div>
                        )}
                    </div>
                )}
            </Fragment>
        );
    }

    private getPreviousMessages(messageId: string): { messageId: string; content: unknown }[] {
        const integratoinChain = this.state.resolvedHistory?.integrationChainData;
        if (!integratoinChain) {
            return [];
        }

        const index = integratoinChain.findIndex((element: { messageId: string }) => element.messageId === messageId);

        const previousMessages = [];
        for (let i = index + 1; i < integratoinChain.length; i++) {
            previousMessages.push({
                messageId: integratoinChain[i].messageId,
                content: integratoinChain[i].document
            });
        }
        return previousMessages;
    }

    private async loadIntegrationHistory(): Promise<void> {
        // update URL to include debugview=true
        window.history.replaceState(
            null,
            "",
            `/${this.props.match.params.network}/identity-resolver/${this.props.match.params.did}?debugview=true`
        );

        if (!this.props.match.params.did) {
            return;
        }

        this.setState({ loadingHistory: true });

        const res = await ServiceFactory.get<IdentityService>("identity").resolveHistory(
            this.props.match.params.did,
            this.props.match.params.network
        );

        // handle if response contains Error.
        if (res.error) {
            if (typeof res.error === "object") {
                res.error = JSON.stringify(res.error);
            }
            this.setState({
                error: res.error,
                loadingHistory: false
            });
            return;
        }

        // reverse the order (first message becomes the newest)
        res.integrationChainData = res.integrationChainData?.reverse();

        this.setState({
            historyLoaded: true,
            resolvedHistory: res,
            loadingHistory: false,
            selectedMessageId: res.integrationChainData?.[0].messageId,
            contentOfSelectedMessage: res.integrationChainData?.[0].document
        });
    }

    /**
     * @returns true if URL contains parameter debugview=true
     */
    private isDebugView() {
        const params = new URLSearchParams(document.location.search.slice(1));
        return params.get("debugview") === "true";
    }
}
