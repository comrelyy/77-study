export function pendingInteractionGame(pack,dialogue,game){
  if(!pack.interaction||game.finished||!dialogue.done)return false;
  const round=pack.modules.dialogue[dialogue.index],answer=round.options.find(o=>o.id===dialogue.selection);
  if(!answer||(dialogue.speechIndex||0)<1+answer.followUp.length)return false;
  const after=pack.interaction.gameAfterDialogue[game.index];
  return Number.isInteger(after)&&after<=dialogue.index+1;
}
