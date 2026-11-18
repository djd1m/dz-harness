/** The provider returned a choice that fails the host contract. */
export class ChoiceError extends Error {
 constructor(reason,message) {
  super(message);
  this.reason=reason;
 }
}
