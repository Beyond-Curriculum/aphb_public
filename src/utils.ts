import Standings, { IStandings } from './models/standingsModel';

export const getSortedStandings = async (league: string): Promise<IStandings[]> => {
	try {
		// Find and sort standings
		const standings = await Standings.find({ league }).sort({total: -1, "tours.CB": -1, qualPoints: -1}).exec();
		const nonDisqualifiedStandings = standings.filter(standing => !standing.disqualified);
		return nonDisqualifiedStandings;
	} catch (error) {
		// Handle errors (log, throw, or return a custom response)
		console.error(`Error fetching sorted standings: ${error}`);
		throw error; // Re-throw the error to be handled elsewhere
	}
}

export const getNearestStandings = async (standing: IStandings, numberOfStandings: number): Promise<IStandings[] | null> => {
		
	const standings: IStandings[] = await getSortedStandings(standing.league);
	if (standings.length <= numberOfStandings) {
		return null;
	}
	// Find the index of the current standing
	const currentIndex = standings.findIndex(s => s.name === standing.name);

	// Return the nearest standings
	let curExpansion = 0;
	let leftIndex = currentIndex;
	let rightIndex = currentIndex;
	while (
		(rightIndex - leftIndex) < numberOfStandings &&
		(leftIndex > 0 || rightIndex < standings.length - 1)
	) {
		curExpansion += 0.5;
		// Expand to the left while total deviation is less than or equal to curExpansion
		if (leftIndex > 0 && (standings[leftIndex].total - standing.total) <= curExpansion) {
			leftIndex--;
		}
		// Expand to the right while total deviation is less than or equal to curExpansion
		if (rightIndex < standings.length - 1 && (standing.total - standings[rightIndex].total) <= curExpansion) {
			rightIndex++;
		}
		// Break if we reached the ends of the standings
		if (leftIndex === 0 && rightIndex === standings.length - 1) {
			break;
		}
	}

	const nearestStandings = standings.slice(leftIndex, rightIndex + 1);
	// remove the current standing from the list
	return nearestStandings.filter(s => s.name !== standing.name);
}
