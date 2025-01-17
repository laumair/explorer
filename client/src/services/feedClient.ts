import { Blake2b } from "@iota/crypto.js";
import { deserializeMessage, INDEXATION_PAYLOAD_TYPE, MILESTONE_PAYLOAD_TYPE, SIG_LOCKED_SINGLE_OUTPUT_TYPE, TRANSACTION_PAYLOAD_TYPE } from "@iota/iota.js";
import { asTransactionObject } from "@iota/transaction-converter";
import { Converter, ReadStream } from "@iota/util.js";
import { io, Socket } from "socket.io-client";
import { ServiceFactory } from "../factories/serviceFactory";
import { TrytesHelper } from "../helpers/trytesHelper";
import { IFeedItemMetadata } from "../models/api/IFeedItemMetadata";
import { IFeedSubscribeRequest } from "../models/api/IFeedSubscribeRequest";
import { IFeedSubscribeResponse } from "../models/api/IFeedSubscribeResponse";
import { IFeedSubscriptionMessage } from "../models/api/IFeedSubscriptionMessage";
import { IFeedUnsubscribeRequest } from "../models/api/IFeedUnsubscribeRequest";
import { INetwork } from "../models/db/INetwork";
import { IFeedItem } from "../models/IFeedItem";
import { NetworkService } from "./networkService";

/**
 * Class to handle api communications.
 */
export class FeedClient {
    /**
     * Minimun number of each item to keep.
     */
    private static readonly MIN_ITEMS_PER_TYPE: number = 50;

    /**
     * The endpoint for performing communications.
     */
    private readonly _endpoint: string;

    /**
     * Network configuration.
     */
    private readonly _networkId: string;

    /**
     * Network configuration.
     */
    private readonly _networkConfig?: INetwork;

    /**
     * The web socket to communicate on.
     */
    private readonly _socket: Socket;

    /**
     * The latest items.
     */
    private _items: IFeedItem[];

    /**
     * Existing ids.
     */
    private _existingIds: string[];

    /**
     * The subscription id.
     */
    private _subscriptionId?: string;

    /**
     * The subscribers.
     */
    private readonly _subscribers: {
        [id: string]: (newItems: IFeedItem[], metaData: { [id: string]: IFeedItemMetadata }) => void;
    };

    /**
     * Create a new instance of TransactionsClient.
     * @param endpoint The endpoint for the api.
     * @param networkId The network configurations.
     */
    constructor(endpoint: string, networkId: string) {
        this._endpoint = endpoint;
        this._networkId = networkId;

        const networkService = ServiceFactory.get<NetworkService>("network");
        this._networkConfig = networkService.get(this._networkId);

        // Use websocket by default
        // eslint-disable-next-line new-cap
        this._socket = io(this._endpoint, { upgrade: true, transports: ["websocket"] });

        // If reconnect fails then also try polling mode.
        this._socket.on("reconnect_attempt", () => {
            this._socket.io.opts.transports = ["polling", "websocket"];
        });

        this._items = [];
        this._existingIds = [];
        this._subscribers = {};
    }

    /**
     * Perform a request to subscribe to transactions events.
     * @param callback Callback called with transactions data.
     * @returns The subscription id.
     */
    public subscribe(callback: (newItems: IFeedItem[], metaData: { [id: string]: IFeedItemMetadata }) => void): string {
        const subscriptionId = TrytesHelper.generateHash(27);
        this._subscribers[subscriptionId] = callback;

        try {
            if (!this._subscriptionId) {
                const subscribeRequest: IFeedSubscribeRequest = {
                    network: this._networkId
                };

                this._socket.emit("subscribe", subscribeRequest);
                this._socket.on("subscribe", (subscribeResponse: IFeedSubscribeResponse) => {
                    if (!subscribeResponse.error) {
                        this._subscriptionId = subscribeResponse.subscriptionId;
                    }
                });
                this._socket.on("transactions", async (subscriptionMessage: IFeedSubscriptionMessage) => {
                    if (subscriptionMessage.subscriptionId === this._subscriptionId) {
                        if (subscriptionMessage.itemsMetadata) {
                            for (const metadataId in subscriptionMessage.itemsMetadata) {
                                const existing = this._items.find(c => c.id === metadataId);
                                if (existing) {
                                    existing.metaData = {
                                        ...existing.metaData,
                                        ...subscriptionMessage.itemsMetadata[metadataId]
                                    };
                                }
                            }
                        }

                        const filteredNewItems = subscriptionMessage.items
                            .map(item => this.convertItem(item))
                            .filter(nh => !this._existingIds.includes(nh.id));

                        if (filteredNewItems.length > 0) {
                            this._items = filteredNewItems.slice().concat(this._items);

                            let removeItems: IFeedItem[] = [];

                            if (this._networkConfig?.protocolVersion === "og") {
                                const zero = this._items.filter(t => t.payloadType === "Transaction" && t.value === 0);
                                const zeroToRemoveCount = zero.length - FeedClient.MIN_ITEMS_PER_TYPE;
                                if (zeroToRemoveCount > 0) {
                                    removeItems = removeItems.concat(zero.slice(-zeroToRemoveCount));
                                }
                                const nonZero = this._items.filter(t => t.payloadType === "Transaction" &&
                                    t.value !== 0 && t.value !== undefined);
                                const nonZeroToRemoveCount = nonZero.length - FeedClient.MIN_ITEMS_PER_TYPE;
                                if (nonZeroToRemoveCount > 0) {
                                    removeItems = removeItems.concat(nonZero.slice(-nonZeroToRemoveCount));
                                }
                            } else {
                                const transactionPayload = this._items.filter(t => t.payloadType === "Transaction");
                                const transactionPayloadToRemoveCount =
                                    transactionPayload.length - FeedClient.MIN_ITEMS_PER_TYPE;
                                if (transactionPayloadToRemoveCount > 0) {
                                    removeItems =
                                        removeItems.concat(transactionPayload.slice(-transactionPayloadToRemoveCount));
                                }
                                const indexPayload = this._items.filter(t => t.payloadType === "Index");
                                const indexPayloadToRemoveCount = indexPayload.length - FeedClient.MIN_ITEMS_PER_TYPE;
                                if (indexPayloadToRemoveCount > 0) {
                                    removeItems = removeItems.concat(indexPayload.slice(-indexPayloadToRemoveCount));
                                }
                                const msPayload = this._items.filter(t => t.payloadType === "MS");
                                const msPayloadToRemoveCount = msPayload.length - FeedClient.MIN_ITEMS_PER_TYPE;
                                if (msPayloadToRemoveCount > 0) {
                                    removeItems = removeItems.concat(msPayload.slice(-msPayloadToRemoveCount));
                                }
                                const nonePayload = this._items.filter(t => t.payloadType === "None");
                                const nonePayloadToRemoveCount = nonePayload.length - FeedClient.MIN_ITEMS_PER_TYPE;
                                if (nonePayloadToRemoveCount > 0) {
                                    removeItems = removeItems.concat(nonePayload.slice(-nonePayloadToRemoveCount));
                                }
                            }

                            this._items = this._items.filter(t => !removeItems.includes(t));

                            this._existingIds = this._items.map(t => t.id);
                        }

                        for (const sub in this._subscribers) {
                            this._subscribers[sub](filteredNewItems, subscriptionMessage.itemsMetadata);
                        }
                    }
                });
            }
        } catch { }

        return subscriptionId;
    }

    /**
     * Perform a request to unsubscribe to transactions events.
     * @param subscriptionId The subscription id.
     */
    public unsubscribe(subscriptionId: string): void {
        try {
            delete this._subscribers[subscriptionId];

            if (this._subscriptionId && Object.keys(this._subscribers).length === 0) {
                const unsubscribeRequest: IFeedUnsubscribeRequest = {
                    network: this._networkId,
                    subscriptionId: this._subscriptionId
                };
                this._socket.emit("unsubscribe", unsubscribeRequest);
                this._socket.on("unsubscribe", () => { });
            }
        } catch {
        } finally {
            this._subscriptionId = undefined;
        }
    }

    /**
     * Get the items.
     * @returns The item details.
     */
    public getItems(): IFeedItem[] {
        return this._items.slice();
    }

    /**
     * Convert the feed item into real data.
     * @param item The item source.
     * @returns The feed item.
     */
    private convertItem(item: string): IFeedItem {
        if (this._networkConfig?.protocolVersion === "chrysalis") {
            const bytes = Converter.hexToBytes(item);
            const messageId = Converter.bytesToHex(Blake2b.sum256(bytes));

            let value;
            let payloadType: "Transaction" | "Index" | "MS" | "None" = "None";
            const properties: { [key: string]: unknown } = {};
            let message;

            try {
                message = deserializeMessage(new ReadStream(bytes));

                if (message.payload?.type === TRANSACTION_PAYLOAD_TYPE) {
                    payloadType = "Transaction";
                    value = 0;

                    for (const output of message.payload.essence.outputs) {
                        if (output.type === SIG_LOCKED_SINGLE_OUTPUT_TYPE) {
                            value += output.amount;
                        }
                    }

                    if (message.payload.essence.payload) {
                        properties.Index = message.payload.essence.payload.index;
                    }
                } else if (message.payload?.type === MILESTONE_PAYLOAD_TYPE) {
                    payloadType = "MS";
                    properties.MS = message.payload.index;
                } else if (message.payload?.type === INDEXATION_PAYLOAD_TYPE) {
                    payloadType = "Index";
                    properties.Index = message.payload.index;
                }
            } catch (err) {
                console.error(err);
            }

            return {
                id: messageId,
                value,
                parents: message?.parentMessageIds ?? [],
                properties,
                payloadType
            };
        }

        const tx = asTransactionObject(item);

        return {
            id: tx.hash,
            value: tx.value,
            parents: [
                tx.trunkTransaction,
                tx.branchTransaction
            ],
            properties: {
                "Tag": tx.tag,
                "Address": tx.address,
                "Bundle": tx.bundle
            },
            payloadType: "Transaction"
        };
    }
}
