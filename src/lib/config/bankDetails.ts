export interface BankTransferDetails {
  accountName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  accountType: string;
  branchName: string;
  branchAddress: string;
  whatsappNumber: string;
  whatsappDisplay: string;
  instructions: string[];
}

export const BANK_TRANSFER_DETAILS: BankTransferDetails = {
  accountName: "MILLENNIUM DESIGNS",
  bankName: "ICICI Bank",
  accountNumber: "001205013891",
  ifscCode: "ICIC0000012",
  accountType: "Current Account",
  branchName: "Jaipur - C Scheme Branch",
  branchAddress: "C-101, Ridhi Sidhi Complex, Subhash Marg, Ahinsa Circle, C-Scheme, Jaipur, Rajasthan - 302001",
  whatsappNumber: "919828156465",
  whatsappDisplay: "+91 98281 56465",
  instructions: [
    "Initiate an IMPS, NEFT, or RTGS bank transfer using the ICICI Bank account details above.",
    "Quote your Order Number in the transfer remarks/description for automatic reconciliation.",
    "After completing the transfer, share your UTR or transaction confirmation screenshot via WhatsApp for expedited artisan scheduling.",
  ],
};
