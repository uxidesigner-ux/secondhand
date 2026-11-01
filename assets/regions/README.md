# 대한민국 행정동 경계 데이터

본 데이터는 통계청 통계지리정보서비스(SGIS, https://sgis.kostat.go.kr)에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: vuski/admdongkor, https://github.com/vuski/admdongkor), CC BY 4.0으로 배포됩니다.

- 경계 기준일: **2026-10-01**, USED 변환일: **2026-11-02**
- 원본: [vuski/admdongkor의 emd_20261001_light.parquet](https://raw.githubusercontent.com/vuski/admdongkor/master/parquet/simplified/emd_20261001_light.parquet)
- 원자료: [통계청 SGIS](https://sgis.kostat.go.kr), [공공누리 제1유형](https://www.kogl.or.kr/info/licenseType1.do)
- 가공 데이터: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). upstream 라이선스 원문은 [LICENSE-DATA](./LICENSE-DATA)에 그대로 보존했습니다.
- 데이터/해시/용량: [source.json](./source.json)

원본의 **light geometry**를 GeoJSON으로 변환하고 gzip으로 압축했습니다. USED는 좌표 반올림이나 추가 경계 단순화를 하지 않았습니다. 3,559개 행정동의 Polygon/MultiPolygon geometry는 원본 light 데이터와 동일합니다. 속성은 시도·시군구·읍면동을 합친 전체 이름과 각 이름·행정코드입니다. 좌표 순서는 WGS84 경도, 위도입니다.

브라우저는 이 고정 경계 파일을 받아 기기 안에서 좌표 포함 여부를 계산합니다. 현재 위치 좌표를 파일 요청 URL, 헤더, 본문 또는 외부 역지오코딩 서비스로 전송하지 않습니다. 파일은 필요할 때만 불러오며 HTTP 캐시와 페이지 메모리를 사용할 수 있습니다.

## 한계

행정동을 표시하기 위한 참고 경계이며 법정동·도로명주소·필지 조회가 아닙니다. 원본 light 데이터는 이미 단순화되어 있어 경계 부근, 섬, 해안에서는 실제 주소와 차이가 날 수 있습니다. 기준일 이후 변경은 반영하지 않습니다. 일치하는 경계가 없거나 서로 다른 경계가 겹치면 지역명은 제공하지 않으며 가까운 동으로 대체하지 않습니다. GPS 오차도 표시 결과에 영향을 줄 수 있습니다.

테스트의 서울시청·서울숲·대전시청·제주시청 좌표는 공개 장소 부근의 고정 테스트 좌표입니다. 사용자의 실제 위치가 아니며, 경계 데이터가 독립적으로 정확하다는 보증도 아닙니다.
