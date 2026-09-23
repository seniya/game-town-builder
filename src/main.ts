// 부트스트랩. game 과 render 를 함께 아는 유일한 위치다 (MVP_SPEC 33).

/** 캔버스를 찾아 반환한다. 없으면 부트스트랩을 중단한다. */
function getCanvas(): HTMLCanvasElement {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('#game canvas 를 찾을 수 없다');
  }
  return canvas;
}

getCanvas();
