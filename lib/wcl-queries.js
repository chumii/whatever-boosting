export const REPORT_SUMMARY = `
  query ReportSummary($code: String!) {
    reportData {
      report(code: $code) {
        title
        startTime
        endTime
        zone { name }
        fights(killType: Encounters) {
          id
          name
          encounterID
          kill
          difficulty
          bossPercentage
          startTime
          endTime
        }
        masterData {
          actors {
            id
            name
            type
            subType
            petOwner
            server
            icon
          }
        }
      }
    }
  }
`;

export const EVENTS_PAGE = `
  query EventsPage(
    $code: String!
    $startTime: Float!
    $endTime: Float!
    $dataType: EventDataType!
    $filterExpression: String
    $targetClass: String
  ) {
    reportData {
      report(code: $code) {
        events(
          startTime: $startTime
          endTime: $endTime
          dataType: $dataType
          filterExpression: $filterExpression
          targetClass: $targetClass
        ) {
          data
          nextPageTimestamp
        }
      }
    }
  }
`;
