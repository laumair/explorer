import { ISigLockedDustAllowanceOutput, ISigLockedSingleOutput, IUTXOInput, UnitsHelper } from "@iota/iota.js";
import React, { ReactNode } from "react";
import { RouteComponentProps } from "react-router-dom";
import { ServiceFactory } from "../../../factories/serviceFactory";
import { Bech32AddressHelper } from "../../../helpers/bech32AddressHelper";
import { TransactionsHelper } from "../../../helpers/transactionsHelper";
import { ApiClient } from '../../../services/apiClient';
import { NetworkService } from "../../../services/networkService";
import { SettingsService } from "../../../services/settingsService";
import { TangleCacheService } from "../../../services/tangleCacheService";
import AsyncComponent from "../../components/AsyncComponent";
import Bech32Address from "../../components/chrysalis/Bech32Address";
import QR from "../../components/chrysalis/QR";
import FiatValue from "../../components/FiatValue";
import { ModalIcon } from "../../components/ModalProps";
import Spinner from "../../components/Spinner";
import messageJSON from "./../../../assets/modals/message.json";
import Transaction from "./../../components/chrysalis/Transaction";
import Modal from "./../../components/Modal";
import "./Addr.scss";
import { AddrRouteProps } from "./AddrRouteProps";
import { AddrState } from "./AddrState";


/**
 * Component which will show the address page.
 */
class Addr extends AsyncComponent<RouteComponentProps<AddrRouteProps>, AddrState> {
    /**
     * API Client for tangle requests.
     */
    private readonly _tangleCacheService: TangleCacheService;

    /**
     * Settings service.
     */
    private readonly _settingsService: SettingsService;

    /**
     * The hrp of bech addresses.
     */
    private readonly _bechHrp: string;

    /**
     * Create a new instance of Addr.
     * @param props The props.
     */
    constructor(props: RouteComponentProps<AddrRouteProps>) {
        super(props);

        this._tangleCacheService = ServiceFactory.get<TangleCacheService>("tangle-cache");
        this._settingsService = ServiceFactory.get<SettingsService>("settings");

        const networkService = ServiceFactory.get<NetworkService>("network");
        const networkConfig = this.props.match.params.network
            ? networkService.get(this.props.match.params.network)
            : undefined;

        this._bechHrp = networkConfig?.bechHrp ?? "iot";

        this.state = {
            ...Bech32AddressHelper.buildAddress(
                this._bechHrp,
                props.match.params.address
            ),
            formatFull: false,
            transactions: undefined,
            statusBusy: true,
            status: "Loading transactions...",
            filterValue: "all",
            received: 0,
            sent: 0
        };
    }

    /**
     * The component mounted.
     */
    public async componentDidMount(): Promise<void> {
        super.componentDidMount();
        const result = await this._tangleCacheService.search(
            this.props.match.params.network, this.props.match.params.address);

        if (result?.address) {
            window.scrollTo({
                left: 0,
                top: 0,
                behavior: "smooth"
            });

            this.setState({
                address: result.address,
                bech32AddressDetails: Bech32AddressHelper.buildAddress(
                    this._bechHrp,
                    result.address.address,
                    result.address.addressType
                ),
                balance: result.address.balance,
                outputIds: result.addressOutputIds,
                historicOutputIds: result.historicAddressOutputIds
            }, async () => {
                await this.getTransactions(this.state.outputIds, this.state.historicOutputIds);
                await this.testrag();
            });
        } else {
            this.props.history.replace(`/${this.props.match.params.network}/search/${this.props.match.params.address}`);
        }
    }

    /**
     * Render the component.
     * @returns The node to render.
     */
    public render(): ReactNode {
        return (
            <div className="addr">
                <div className="wrapper">
                    <div className="inner">
                        <div className="addr--header">
                            <div className="row middle">
                                <h1>
                                    Address
                                </h1>
                                <Modal icon={ModalIcon.Dots} data={messageJSON} />
                            </div>
                        </div>
                        <div className="top">
                            <div className="sections">
                                <div className="section">
                                    <div className="section--header">
                                        <div className="row middle">
                                            <h2>
                                                General
                                            </h2>
                                            <Modal icon={ModalIcon.Info} data={messageJSON} />
                                        </div>
                                    </div>
                                    <div className="row space-between general-content">
                                        <div className="section--data">
                                            <Bech32Address
                                                addressDetails={this.state.bech32AddressDetails}
                                                advancedMode={true}
                                            />
                                            <div className="section--data">
                                                <div className="label">
                                                    Total received
                                                </div>
                                                <div className="value">
                                                    {this.state.statusBusy ? (<Spinner />)
                                                        : (
                                                            <React.Fragment>
                                                                {UnitsHelper.formatBest(this.state.received)}
                                                                {" "}(<FiatValue value={this.state.received} />)
                                                            </React.Fragment>
                                                        )}
                                                </div>
                                            </div>
                                            <div className="section--data">
                                                <div className="label">
                                                    Total sent
                                                </div>
                                                <div className="value">
                                                    {this.state.statusBusy ? (<Spinner />)
                                                        : (
                                                            <React.Fragment>
                                                                {UnitsHelper.formatBest(this.state.sent)}
                                                                {" "}(<FiatValue value={this.state.sent} />)
                                                            </React.Fragment>
                                                        )}
                                                </div>
                                            </div>

                                            {this.state.balance !== undefined && this.state.balance === 0 && (
                                                <div className="section--data">
                                                    <div className="label">
                                                        Final balance
                                                    </div>
                                                    <div className="value">
                                                        0
                                                    </div>
                                                </div>
                                            )}
                                            {this.state.balance !== undefined && this.state.balance !== 0 && (
                                                <div className="section--data">
                                                    <div className="label">
                                                        Final balance
                                                    </div>
                                                    <div className="value">
                                                        {UnitsHelper.formatBest(this.state.balance)}
                                                        {" "}(<FiatValue value={this.state.balance} />)
                                                    </div>
                                                </div>
                                            )}


                                            {this.state.status && (
                                                <div className="middle row">
                                                    {this.state.statusBusy && (<Spinner />)}
                                                    <p className="status">
                                                        {this.state.status}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                        <div className="section--data">
                                            {this.state.bech32AddressDetails?.bech32 &&
                                                (
                                                    //  eslint-disable-next-line react/jsx-pascal-case
                                                    <QR data={this.state.bech32AddressDetails.bech32} />
                                                )}
                                        </div>
                                    </div>

                                </div>
                                {this.state.outputs && this.state.outputs.length === 0 && (
                                    <div className="section">
                                        <div className="section--data">
                                            <p>
                                                There are no transactions for this address.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {this.state.transactions && this.state.transactions?.length > 0 && (
                                    <div className="section transaction--section">
                                        <div className="section--header section--header__space-between">
                                            <div className="row middle">
                                                <h2>
                                                    Transaction History
                                                </h2>
                                                <Modal icon={ModalIcon.Info} data={messageJSON} />
                                            </div>
                                            <div className="messages-tangle-state">
                                                <div className="transactions-filter">
                                                    <button
                                                        className="filter-buttons"
                                                        type="button"
                                                        onClick={() => {
                                                            this.setState({ filterValue: "all" });
                                                        }}
                                                    >
                                                        All
                                                    </button>
                                                    <button
                                                        className="filter-buttons middle"
                                                        type="button"
                                                        onClick={() => {
                                                            this.setState({ filterValue: "incoming" });
                                                        }}
                                                    >
                                                        Incoming
                                                    </button>
                                                    <button
                                                        className="filter-buttons"
                                                        type="button"
                                                        onClick={() => {
                                                            this.setState({ filterValue: "outgoing" });
                                                        }}
                                                    >
                                                        Outgoing
                                                    </button>
                                                </div>
                                            </div>

                                        </div>
                                        <table className="transaction--table">
                                            <tr>
                                                <th>Message id</th>
                                                <th>Date</th>
                                                <th>Inputs</th>
                                                <th>Outputs</th>
                                                <th>Status</th>
                                                <th>Amount</th>
                                                <th>[DEV]: is_spent</th>
                                            </tr>
                                            {this.state.transactions?.map(tx =>
                                            (
                                                <Transaction
                                                    key={tx?.messageId}
                                                    network={this.props.match.params.network}
                                                    {...tx}
                                                />
                                            ))}
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div >
                </div >
            </div >
        );
    }

    private async getTransactions(outputIds: string[] = [], historicOutputIds: string[] = []): Promise<void> {
        const transactions = [];
        const totalOutputIds = outputIds.concat(historicOutputIds);
        if (totalOutputIds) {
            for (const outputId of totalOutputIds) {
                const outputResult = await this._tangleCacheService.outputDetails(
                    this.props.match.params.network, outputId);

                if (outputResult) {
                    const messageResult = await this._tangleCacheService.search(
                        this.props.match.params.network, outputResult.messageId);
                    const { inputs, outputs, ...rest } = await
                        TransactionsHelper.getInputsAndOutputs(messageResult?.message,
                            this.props.match.params.network, this._bechHrp, this._tangleCacheService);
                    const { date, messageTangleStatus } = await TransactionsHelper.getMessageStatus(
                        this.props.match.params.network, outputResult.messageId,
                        this._tangleCacheService);
                    const amount = await this.getTransactionAmount(inputs, outputs);
                    transactions.push({
                        messageId: outputResult.messageId,
                        inputs: inputs.length,
                        outputs: outputs.length,
                        date,
                        messageTangleStatus,
                        amount,
                        isSpent: outputResult.isSpent
                    });
                    this.setState({
                        transactions,
                        status: `Loading transactions [${transactions.length}/${totalOutputIds.length}]`
                    });
                }

                if (!this._isMounted) {
                    break;
                }
            }
            this.setState({
                status: "",
                statusBusy: false
            });
        }
    }

    private async testrag() {
        const apiClient = ServiceFactory.get<ApiClient>("api-client");
        const response = await apiClient.transactionsDetails({
            network: this.props.match.params.network,
            address: this.state.address?.address ?? ""
        });
        console.log("response", response);
    }

    // Add logic
    private async getTransactionAmount(
        inputs: IUTXOInput[],
        outputs: (ISigLockedSingleOutput | ISigLockedDustAllowanceOutput)[]): Promise<number> {
        return 0;
    }
}

export default Addr;
